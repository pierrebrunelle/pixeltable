# Pixeltable Open Source Local UI

[Pixeltable Web UI - Product Requirements Document](https://www.notion.so/Pixeltable-Web-UI-Product-Requirements-Document-22054609e49080aca7edcc4882d822f9?pvs=21)

### **Description**

Pixeltable Web UI provides users with a view of their Pixeltable directories and metadata for introspection and debugging purposes. It ships with every instance of Pxt directly when `pip install pixeltable` and is available at ``http://localhost:XXXX.`

## **Example User Flow**

1. User installs `pixeltable` using `pip` 
2. `print(context.console_url), e.g.`
    1. `127.0.0.1:8265` or [`http://localhost:3000/directory/<director_name>/`](http://localhost:3000/directory/%3Cdirector_name%3E/)
3. User opens the UI and select their directory(namespace)
4. User explores tables, views, and models using the interface.
5. User browse the information schema to gain insights from the metadata.
6. User drills into specific tables and views to look at column-level lineage and understand data transformations.

## **Core Features**

- **Directory Exploration**
    - **P0** All available directories are available and users can switch between them to view specific assets within them.
- **Table, View, and Model Exploration:**
    - **P0** Navigate all available tables, views, and models within the available directories.
    - **P0** Allow to browse view definitions and model structures
    - **P1** Allow users to preview table data with options for sorting, filtering, and pagination.
- **Information Schema Access:**
    - **P0** Provide access to the information schema for in-depth metadata exploration.
    - **P0** Display details about tables, columns, data types, constraints, and relationships.
- **Column-Level Lineage Visualization:**
    - **P0** Implement an interactive visualization to trace the lineage of columns.
    - **P0** Clearly show how columns are derived, transformed, or aggregated across tables
    - **P0** Provide zoom and pan capabilities for exploring lineages
- **Additional UI Functionality**
    - **P0 Browse/Search** capabilities to quickly locate tables, views, models, and columns.
    - **P1** **Filtering** options to narrow down results based on criteria
        - *Some temporal features*
        - Column data type, etc…

### **Useful Projects**

- https://github.com/schemaspy/schemaspy?tab=readme-ov-file
- https://pypi.org/project/ERAlchemy/
- https://sqldbm.com/Home/

### References

- https://www.selectstar.com/ - https://dbdiagram.io/d/5c79327af7c5bb70c72f2a11
- https://discourse.getdbt.com/t/creating-an-erd-for-your-dbt-project/1436 - https://www.datensen.com/blog/er-diagram/what-is-entity-relationship-diagram-erd/
- https://dbmstools.com/categories/database-diagram-tools/interbase - https://atlan.com/data-lineage-explained/
- https://learning.postman.com/docs/postman-flows/build-flows/visualize-data/ - https://www.montecarlodata.com/blog-data-catalog-tools/
- https://pgdash.io/ - https://www.metaplane.dev/blog/the-definitive-guide-to-snowflake-data-lineage - https://hackolade.com/nosqldb/databricks-data-modeling.html
- https://docs.ray.io/en/latest/ray-observability/getting-started.html
- https://github.com/temporalio/ui | https://www.youtube.com/watch?v=POfqtWgjdH8

### Information Schema

- [Information Schema](https://www.notion.so/Information-Schema-c6f259ed78c54f1cb64caef6eeee2372?pvs=21)
- https://www.snowflake.com/blog/using-snowflake-information-schema/
- https://docs.databricks.com/en/sql/language-manual/sql-ref-information-schema.html

---

## UI Inspirations

### Column-level Lineage and Data Lineage

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image.png)

## Entity Relationship Diagrams (ERDs)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%201.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%202.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%203.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%204.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%205.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%206.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%207.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%208.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%209.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2010.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2011.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2012.png)

---

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2013.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2014.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2015.png)

---

### Browsing/Searching Unstructured Data

Scale AI: https://dashboard.scale.com/nucleus/ds_bwk18y3e696g05rk8gyg?display=explorer&explorer_display=image

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2016.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2017.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2018.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2019.png)

![image.png](Pixeltable%20Open%20Source%20Local%20UI/image%2020.png)

# Pixeltable Web UI Implementation

So we want to build a dashboard for pixeltable. A web UI that provides overview of directories, tables, views, and models, available to the user. We expect the user of dashboard to be able to understand the domain data they work with and its structure inside pixeltable.

The dashboard is expected to be available through the Python package that spins up a small web server that hosts the UI and necessary API for accessing underlying pixeltable data. We should also expect this dashboard to become the fundamental part of cloud UI offering in long term.

Following explains the context we are in at the beginning of development work. It provides assumptions about the tool we pick, so the engineering team in the future can assess if anything no longer serves the intended purpose.

Given current size and composition of development team, the setup of dashboard UI shall be optimized for future onboarding of new engineers. Chosen tooling shall be familiar to larger pool of engineers to make it easier to build up the development team. Eventual cloud UI offering means the first phase of dashboard UI shall be portable.

## Bundle

The dashboard UI shall be a single-page application served by the Python package. The main advantage of SPA (over multi-page) that we can utilize more context when presenting data. The nature of pixeltable's domain implies a lot of nested information and deep data hierarchy.

Whenever a new version of Pixeltable is pushed to PyPi registry, it shall contain pre-built static assets for the web UI. The package can utilize [aiohttp](https://docs.aiohttp.org/en/stable/index.html) for serving static assets on the user's machine and providing necessary APIs for the UI to work with.

## Stack

[TypeScript](https://www.typescriptlang.org/) pretty much an accepted standard these days. Staying close to JavaScript itself, provides typing system that boosts productivity, improves engineering onboarding and serves as a safety net from the most trivial bugs.

[React](https://react.dev/) as a UI runtime library. Still de facto the UI library. The component model provides the most suitable way to reuse components thus ensures portability for pixeltable dashboard. React has the largest pool of available engineers on the market, and huge ecosystem of available auxilliary components and libraries to use.

[Vite](https://vite.dev/) to build it all. We expect the frontend to be shipped as a bunch of static assets, and Vite is the easiest solution for this. It requires almost no configuration, ensuring low maintenance cost. Building static bundles can also help if we consider building a custom jupyter cell output for pixeltable's dataframe.

[Tailwindcss](https://tailwindcss.com/) as a styling framework. Solid option for non-frontend engineers to work with, copilot friendly, has large library of templates to copy-paste from. Establishes consistent styling language that should help new engineers to onboard. Provides ability to tweak certain aspects of design on configuration level (white spaces, sizes, colors). [TailwindUI](https://tailwindui.com) (free version) can be used as a default design system — this can speed up implementation of wireframes while providing slick looking and consistent result.

[HeadlessUI](https://headlessui.com/) library of bare bones components built by tailwindcss team and with tailwindcss in mind. Small amount of default styling means less overhead for customizing, comparing to other UI libraries. The implementation of these components make almost no assumptions about how these components should behave, which makes this library easy to migrate from, if necessary.

[Observable Plot](https://observablehq.com/plot/) (and [D3](https://d3js.org/)) for data visualization. In pixeltable, we control the kinds of data visualizations and types of underlying computations (i.e. we are not building a dashboard solution that runs user's code). This means we can opt-in to use a visualization library that is good concrete charting types. Even if the assumption about kinds of data visualization change, Plot provides flexible API to build customized charts at no extra cost. It may not be the best solution for rendering large datasets, but it shouldn't be a case for pixeltable dashboard anyway.

[Playwright](https://playwright.dev/) for UI testing. In initial phases of development, writing cheap tests should help a lot with reliability, at low development cost. Unfortunately, this isn't the case for low level UI tests of React components: existing tools require significant effort in writing new tests and the result is hard to debug and maintain. Thus, suggesting to use E2E testing tool right away and focus on testing concrete user scenarios. Investing in this kind of testing earlier will help a lot at later stages, when we'll have plenty of use cases shipped to the real users.

## Caution

Several projects listed above (mainly React, Vite, Tailwindcss) currently in a slow process of releasing next major version. This means certain things in the current major may possibly be obsolete, broken, and replaced.

Given unknown timelines of those projects, it is not recommended to attempt using alpha, beta, or release candidates of future major versions since it comes with a risk of wasting time on unfinished capabilities or facing integration bugs with the rest of the tooling.

At the same time, any current development effort should take into consideration if the APIs in use going to be affected in any way with the upcoming major version update.

**Update (Dec 2024):** the concerns are pretty much resolved by now. Vite and React latest major releases happened without incidents. Running Tailwindcss in beta does not seem to be producing any compatibility issues.

## Plan

1. `dashboard` folder added to the pixeltable repo, initialized as Node.js package with all defined tooling installed.
2. A defined command builds static frontend assets in a particular folder, that can be added to the bundle that’s being shipped to PyPI when new pixeltable version is released.
3. A command added to the Python package that spins up a web server (e.g. using aiohttp) that serves static files.
    1. Adding API routes to this server will provide the dashboard UI with access to necessary data.
4. We start with listing directories, tables, and views, showing the hierarchy in UI.
5. [D3 Tree](https://d3js.org/d3-hierarchy/tree) can be utilized for lineage view. Additional prototyping required.