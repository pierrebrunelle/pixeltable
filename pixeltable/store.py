from __future__ import annotations
from typing import Optional, Dict, Any, List, Tuple, Set
import logging
import dataclasses
import abc

import sqlalchemy as sql
from tqdm.autonotebook import tqdm

from pixeltable import catalog
from pixeltable.metadata import schema
from pixeltable.type_system import StringType
from pixeltable.exec import ExecNode
from pixeltable import exprs
from pixeltable.exprs import ColumnSlotIdx
from pixeltable.utils.sql import log_stmt


_logger = logging.getLogger('pixeltable')


class StoreBase:
    """Base class for stored tables

    Each row has the following system columns:
    - rowid columns: one or more columns that identify a user-visible row across all versions
    - v_min: version at which the row was created
    - v_max: version at which the row was deleted (or MAX_VERSION if it's still live)
    """

    def __init__(self, tbl_version: catalog.TableVersion):
        self.tbl_version = tbl_version
        self.sa_md = sql.MetaData()
        self.sa_tbl: Optional[sql.Table] = None
        self._create_sa_tbl()

    def pk_columns(self) -> List[sql.Column]:
        return self._pk_columns

    def rowid_columns(self) -> List[sql.Column]:
        return self._pk_columns[:-1]

    @abc.abstractmethod
    def _create_rowid_columns(self) -> List[sql.Column]:
        """Create and return rowid columns"""
        pass

    @abc.abstractmethod
    def _create_system_columns(self) -> List[sql.Column]:
        """Create and return system columns"""
        rowid_cols = self._create_rowid_columns()
        self.v_min_col = sql.Column('v_min', sql.BigInteger, nullable=False)
        self.v_max_col = \
            sql.Column('v_max', sql.BigInteger, nullable=False, server_default=str(schema.Table.MAX_VERSION))
        self._pk_columns = [*rowid_cols, self.v_min_col]
        return [*rowid_cols, self.v_min_col, self.v_max_col]


    def _create_sa_tbl(self) -> None:
        """Create self.sa_tbl from self.tbl_version."""
        system_cols = self._create_system_columns()
        all_cols = system_cols.copy()
        idxs: List[sql.Index] = []
        for col in [c for c in self.tbl_version.cols if c.is_stored]:
            # re-create sql.Column for each column, regardless of whether it already has sa_col set: it was bound
            # to the last sql.MutableTable version we created and cannot be reused
            col.create_sa_cols()
            all_cols.append(col.sa_col)
            if col.is_computed:
                all_cols.append(col.sa_errormsg_col)
                all_cols.append(col.sa_errortype_col)
            if col.is_indexed:
                all_cols.append(col.sa_idx_col)

            # we create an index for:
            # - scalar columns
            # - non-computed video and image columns (they will contain external paths/urls that users might want to
            #   filter on)
            if col.col_type.is_scalar_type() \
                    or (col.col_type.is_video_type() or col.col_type.is_image_type()) and not col.is_computed:
                idx_name = f'idx_{col.id}_{self.tbl_version.id.hex}'
                idxs.append(sql.Index(idx_name, col.sa_col))

        if self.sa_tbl is not None:
            # if we're called in response to a schema change, we need to remove the old table first
            self.sa_md.remove(self.sa_tbl)

        # index for all system columns:
        # - base x view joins can be executed as merge joins
        # - speeds up ORDER BY rowid DESC
        # - allows filtering for a particular table version in index scan
        idx_name = f'sys_cols_idx_{self.tbl_version.id.hex}'
        idxs.append(sql.Index(idx_name, *system_cols))
        # v_min/v_max indices: speeds up base table scans needed to propagate a base table insert or delete
        idx_name = f'vmin_idx_{self.tbl_version.id.hex}'
        idxs.append(sql.Index(idx_name, self.v_min_col, postgresql_using='brin'))
        idx_name = f'vmax_idx_{self.tbl_version.id.hex}'
        idxs.append(sql.Index(idx_name, self.v_max_col, postgresql_using='brin'))

        self.sa_tbl = sql.Table(self._storage_name(), self.sa_md, *all_cols, *idxs)

    @abc.abstractmethod
    def _storage_name(self) -> str:
        """Return the name of the data store table"""
        pass

    def _create_table_row(
            self, input_row: exprs.DataRow, row_builder: exprs.RowBuilder, exc_col_ids: Set[int],
            v_min: Optional[int] = None
    ) -> Tuple[Dict[str, Any], int]:
        """Return Tuple[complete table row, # of exceptions] for insert()
        Creates a row that includes the PK columns, with the values from input_row.pk.
        Returns:
            Tuple[complete table row, # of exceptions]
        """
        table_row, num_excs = row_builder.create_table_row(input_row, exc_col_ids)
        assert input_row.pk is not None and len(input_row.pk) == len(self._pk_columns)
        for pk_col, pk_val in zip(self._pk_columns, input_row.pk):
            if pk_col == self.v_min_col and v_min is not None:
                table_row[pk_col.name] = v_min
            else:
                table_row[pk_col.name] = pk_val
        return table_row, num_excs

    def create(self, conn: sql.engine.Connection) -> None:
        self.sa_md.create_all(bind=conn)

    def drop(self, conn: sql.engine.Connection) -> None:
        """Drop store table"""
        self.sa_md.drop_all(bind=conn)

    def add_column(self, col: catalog.Column, conn: sql.engine.Connection) -> None:
        """Add column(s) to the store-resident table based on a catalog column

        Note that a computed catalog column will require two extra columns (for the computed value and for the error
        message).
        """
        assert col.is_stored
        stmt = sql.text(f'ALTER TABLE {self._storage_name()} ADD COLUMN {col.storage_name()} {col.col_type.to_sql()}')
        log_stmt(_logger, stmt)
        conn.execute(stmt)
        added_storage_cols = [col.storage_name()]
        if col.is_computed:
            # we also need to create the errormsg and errortype storage cols
            stmt = (f'ALTER TABLE {self._storage_name()} '
                    f'ADD COLUMN {col.errormsg_storage_name()} {StringType().to_sql()} DEFAULT NULL')
            conn.execute(sql.text(stmt))
            stmt = (f'ALTER TABLE {self._storage_name()} '
                    f'ADD COLUMN {col.errortype_storage_name()} {StringType().to_sql()} DEFAULT NULL')
            conn.execute(sql.text(stmt))
            added_storage_cols.extend([col.errormsg_storage_name(), col.errortype_storage_name()])
        self._create_sa_tbl()
        _logger.info(f'Added columns {added_storage_cols} to storage table {self._storage_name()}')

    def drop_column(self, col: Optional[catalog.Column] = None, conn: Optional[sql.engine.Connection] = None) -> None:
        """Re-create self.sa_tbl and drop column, if one is given"""
        if col is not None:
            assert conn is not None
            stmt = f'ALTER TABLE {self._storage_name()} DROP COLUMN {col.storage_name()}'
            conn.execute(sql.text(stmt))
            if col.is_computed:
                stmt = f'ALTER TABLE {self._storage_name()} DROP COLUMN {col.errormsg_storage_name()}'
                conn.execute(sql.text(stmt))
                stmt = f'ALTER TABLE {self._storage_name()} DROP COLUMN {col.errortype_storage_name()}'
                conn.execute(sql.text(stmt))
        self._create_sa_tbl()

    def load_column(
            self, col: catalog.Column, exec_plan: ExecNode, value_expr_slot_idx: int, embedding_slot_idx: int,
            conn: sql.engine.Connection
    ) -> int:
        """Update store column of a computed column with values produced by an execution plan

        Returns:
            number of rows with exceptions
        Raises:
            sql.exc.DBAPIError if there was an error during SQL execution
        """
        num_excs = 0
        num_rows = 0
        for row_batch in exec_plan:
            num_rows += len(row_batch)
            for result_row in row_batch:
                values_dict: Dict[sql.Column, Any] = {}

                if col.is_computed:
                    if result_row.has_exc(value_expr_slot_idx):
                        num_excs += 1
                        value_exc = result_row.get_exc(value_expr_slot_idx)
                        # we store a NULL value and record the exception/exc type
                        error_type = type(value_exc).__name__
                        error_msg = str(value_exc)
                        values_dict = {
                            col.sa_col: None,
                            col.sa_errortype_col: error_type,
                            col.sa_errormsg_col: error_msg
                        }
                    else:
                        val = result_row.get_stored_val(value_expr_slot_idx)
                        values_dict = {col.sa_col: val}

                if col.is_indexed:
                    # TODO: deal with exceptions
                    assert not result_row.has_exc(embedding_slot_idx)
                    # don't use get_stored_val() here, we need to pass the ndarray
                    embedding = result_row[embedding_slot_idx]
                    values_dict[col.sa_index_col] = embedding

                update_stmt = sql.update(self.sa_tbl).values(values_dict)
                for pk_col, pk_val in zip(self.pk_columns(), result_row.pk):
                    update_stmt = update_stmt.where(pk_col == pk_val)
                log_stmt(_logger, update_stmt)
                conn.execute(update_stmt)

        return num_excs

    def insert_rows(
            self, exec_plan: ExecNode, conn: sql.engine.Connection, v_min: Optional[int] = None
    ) -> Tuple[int, int, Set[int]]:
        """Insert rows into the store table and update the catalog table's md
        Returns:
            number of inserted rows, number of exceptions, set of column ids that have exceptions
        """
        exec_plan.ctx.conn = conn
        batch_size = 16  # TODO: is this a good batch size?
        # TODO: total?
        num_excs = 0
        num_rows = 0
        cols_with_excs: Set[int] = set()
        progress_bar: Optional[tqdm] = None  # create this only after we started executing
        row_builder = exec_plan.row_builder
        try:
            exec_plan.open()
            for row_batch in exec_plan:
                num_rows += len(row_batch)
                for batch_start_idx in range(0, len(row_batch), batch_size):
                    # compute batch of rows and convert them into table rows
                    table_rows: List[Dict[str, Any]] = []
                    for row_idx in range(batch_start_idx, min(batch_start_idx + batch_size, len(row_batch))):
                        row = row_batch[row_idx]
                        table_row, num_row_exc = self._create_table_row(row, row_builder, cols_with_excs, v_min=v_min)
                        num_excs += num_row_exc
                        table_rows.append(table_row)
                        if progress_bar is None:
                            progress_bar = tqdm(desc='Inserting rows into table', unit='rows')
                        progress_bar.update(1)
                    conn.execute(sql.insert(self.sa_tbl), table_rows)
            if progress_bar is not None:
                progress_bar.close()
            return num_rows, num_excs, cols_with_excs
        finally:
            exec_plan.close()

    @abc.abstractmethod
    def _delete_rows_where_clause(self, version: int, where_clause: sql.ClauseElement) -> sql.ClauseElement:
        """Return Where clause for delete_rows()"""
        pass

    def delete_rows(
            self, version: int, where_clause: Optional[sql.ClauseElement], conn: sql.engine.Connection) -> int:
        """Mark rows that were live at version and satisfy where_clause as deleted.
        Returns:
            number of deleted rows
        """
        where_clause = where_clause if where_clause is not None else sql.true()
        delete_where_clause = self._delete_rows_where_clause(version, where_clause)
        stmt = sql.update(self.sa_tbl) \
            .values({self.v_max_col: self.tbl_version.version}) \
            .where(delete_where_clause)
        log_stmt(_logger, stmt)
        status = conn.execute(stmt)
        return status.rowcount


class StoreTable(StoreBase):
    def __init__(self, tbl_version: catalog.TableVersion):
        assert not tbl_version.is_view()
        super().__init__(tbl_version)

    def _create_rowid_columns(self) -> List[sql.Column]:
        self.rowid_col = sql.Column('rowid', sql.BigInteger, nullable=False)
        return [self.rowid_col]

    def _storage_name(self) -> str:
        return f'tbl_{self.tbl_version.id.hex}'

    def _delete_rows_where_clause(self, version: int, where_clause: sql.ClauseElement) -> sql.ClauseElement:
        """Return filter for live rows that match where_clause"""
        return sql.and_(
            self.v_min_col <= version,
            self.v_max_col == schema.Table.MAX_VERSION,
            where_clause)


class StoreView(StoreBase):
    def __init__(self, catalog_view: catalog.TableVersion):
        assert catalog_view.is_view()
        self.base = catalog_view.base.store_tbl
        super().__init__(catalog_view)

    def _create_rowid_columns(self) -> List[sql.Column]:
        # a view row corresponds directly to a single base row, which means it needs to duplicate its rowid columns
        self.rowid_cols = [sql.Column(c.name, c.type) for c in self.base.rowid_columns()]
        return self.rowid_cols

    def _storage_name(self) -> str:
        return f'view_{self.tbl_version.id.hex}'

    def _delete_rows_where_clause(self, version: int, where_clause: sql.ClauseElement) -> sql.ClauseElement:
        """Return filter for rows that belong to base table rows that got deleted in the current version"""
        rowid_clauses = [c1 == c2 for c1, c2 in zip(self.rowid_columns(), self.base.rowid_columns())]
        return sql.and_(
            *rowid_clauses,
            self.base.v_max_col == self.base.tbl_version.version,
            self.v_min_col <= version,
            self.v_max_col == schema.Table.MAX_VERSION,
            where_clause)


class StoreComponentView(StoreView):
    """A view that stores components of its base, as produced by a ComponentIterator

    PK: now also includes pos, the position returned by the ComponentIterator for the base row identified by base_rowid
    """
    def __init__(self, catalog_view: catalog.TableVersion):
        super().__init__(catalog_view)

    def _create_rowid_columns(self) -> List[sql.Column]:
        # each base row is expanded into n view rows
        self.rowid_cols = [sql.Column(c.name, c.type) for c in self.base.rowid_columns()]
        # name of pos column: avoid collisions with bases' pos columns
        self.pos_col = sql.Column(f'pos_{len(self.rowid_cols) - 1}', sql.BigInteger, nullable=False)
        self.pos_col_idx = len(self.rowid_cols)
        self.rowid_cols.append(self.pos_col)
        return self.rowid_cols

    def _create_sa_tbl(self) -> None:
        super()._create_sa_tbl()
        # we need to fix up the 'pos' column in TableVersion
        self.tbl_version.cols_by_name['pos'].sa_col = self.pos_col