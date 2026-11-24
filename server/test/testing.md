# The test/ folder
The test/ folder is generally used for end-to-end (E2E) testing.

First, understand that NestJS has two common testing approaches:
>   Testing type	 |   What it tests
    Unit testing	 |   Individual services, controllers, or functions
    E2E testing	     |   The application from HTTP request to HTTP response

    A. Unit testing
        Unit tests are generally placed alongside the source files.
        For example:- users.service.spec.ts tests the functionality of users.service.ts.
            src/
             ├── users/
             │   ├── users.controller.ts
             │   ├── users.controller.spec.ts
             │   ├── users.service.ts
             │   └── users.service.spec.ts
    B. E2E testing
        Your test/ folder might look like this:
            test/
             ├── app.e2e-spec.ts
             └── jest-e2e.json
        Depending on your NestJS version and selected testing configuration, the files may differ.
            The important file is app.e2e-spec.ts