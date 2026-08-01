import { notFound } from "next/navigation";

// Legacy Suburb Intelligence was an unfinished placeholder that shared the
// warehouse-preview flag with the new /research surface, so enabling Research
// in Production also exposed this "data integration still in development" page
// (HTTP 200). Research and this legacy page are now decoupled: this route
// fails closed with the application's standard 404 unconditionally, and every
// public entry point to it (nav link, homepage tile) has been removed. The new
// research experience lives entirely under /research.
export default function SuburbIntelligencePage() {
  notFound();
}
