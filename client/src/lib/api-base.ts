// __PORT_5000__ is replaced by deploy_website at deploy time.
// In development, it stays as a literal string — detect and fall back to empty.
const RAW_BASE = "__PORT_5000__";
export const API_BASE = RAW_BASE.includes("PORT_") ? "" : RAW_BASE;
