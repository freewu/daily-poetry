// Metro resolves `*.db` requires to an asset module id (number).
declare module '*.db' {
  const assetId: number;
  export default assetId;
}
