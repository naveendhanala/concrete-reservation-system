// Explicit module declaration for xlsx (SheetJS).
// The xlsx v0.18.x package types are not auto-resolved by TypeScript's
// node moduleResolution in all environments; this shim ensures the build passes.
declare module 'xlsx';
