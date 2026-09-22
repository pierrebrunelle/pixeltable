// Generated from the service OpenAPI document. Do not edit.
export interface paths {
    "/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Query Lookup
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        get: operations["query_lookup_lookup_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Query Search
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["query_search_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/docs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Insert Docs
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["insert_docs_docs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Compute Preview
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["compute_preview_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/background": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Compute Background
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["compute_background_background_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/edit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update Edit
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["update_edit_edit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Delete Remove
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["delete_remove_remove_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Insert Upload
         * @description Wrapper for an endpoint `Callable` that carries additional metadata about the endpoint operation.
         */
        post: operations["insert_upload_upload_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** BackgroundJobResponse */
        BackgroundJobResponse: {
            /** Id */
            id: string;
            /** Job Url */
            job_url: string;
        };
        /** Body_compute_background_background_post */
        Body_compute_background_background_post: {
            /** Id */
            id: number;
            /** Title */
            title: string;
        };
        /** Body_compute_preview_preview_post */
        Body_compute_preview_preview_post: {
            /** Id */
            id: number;
            /** Title */
            title: string;
        };
        /** Body_delete_remove_remove_post */
        Body_delete_remove_remove_post: {
            /** Id */
            id: number;
        };
        /** Body_insert_docs_docs_post */
        Body_insert_docs_docs_post: {
            /** Id */
            id: number;
            /** Title */
            title: string;
        };
        /** Body_insert_upload_upload_post */
        Body_insert_upload_upload_post: {
            /** Id */
            id: number;
            /** Title */
            title: string;
            /** Image */
            image?: Blob;
        };
        /** Body_query_search_search_post */
        Body_query_search_search_post: {
            /** Id */
            id: number;
        };
        /** Body_update_edit_edit_post */
        Body_update_edit_edit_post: {
            /** Id */
            id: number;
            /** Title */
            title: string;
        };
        /**
         * DeleteResponse
         * @description Response from a delete endpoint.
         */
        DeleteResponse: {
            /** Num Rows */
            num_rows: number;
        };
        /** DocsResponse */
        DocsResponse: {
            /** Id */
            id: number;
            /** Title Upper */
            title_upper: string;
        };
        /** EditResponse */
        EditResponse: {
            /** Id */
            id: number;
            /** Title Upper */
            title_upper: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** LookupResponse */
        LookupResponse: {
            /**
             * Rows
             * @description Query result rows
             */
            rows: components["schemas"]["LookupRowResponse"][];
        };
        /** LookupRowResponse */
        LookupRowResponse: {
            /** Id */
            id: number;
            /** Title Upper */
            title_upper: string;
        };
        /** PreviewResponse */
        PreviewResponse: {
            /** Title Upper */
            title_upper: string;
        };
        /** SearchResponse */
        SearchResponse: {
            /**
             * Rows
             * @description Query result rows
             */
            rows: components["schemas"]["SearchRowResponse"][];
        };
        /** SearchRowResponse */
        SearchRowResponse: {
            /** Id */
            id: number;
            /** Title Upper */
            title_upper: string;
        };
        /** UploadResponse */
        UploadResponse: {
            /** Id */
            id: number;
            /** Title Upper */
            title_upper: string;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    query_lookup_lookup_get: {
        parameters: {
            query: {
                id: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_search_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_query_search_search_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    insert_docs_docs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_insert_docs_docs_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compute_preview_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_compute_preview_preview_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreviewResponse"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compute_background_background_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_compute_background_background_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackgroundJobResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_edit_edit_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_update_edit_edit_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EditResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_remove_remove_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Body_delete_remove_remove_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeleteResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    insert_upload_upload_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_insert_upload_upload_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
