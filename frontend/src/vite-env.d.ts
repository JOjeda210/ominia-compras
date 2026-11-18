/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the Spring Boot backend; defaults to http://localhost:8080 when unset
  // (see src/sync/backendClient.ts). Never points at ERPNext directly.
  readonly VITE_BACKEND_URL?: string;
}
