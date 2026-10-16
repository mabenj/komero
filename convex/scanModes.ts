import { type Infer, v } from "convex/values";

/** The scan modes, switched on the Scan screen: Add, Use or Need more. */
export const scanMode = v.union(v.literal("add"), v.literal("use"), v.literal("needMore"));
export type ScanMode = Infer<typeof scanMode>;
export const SCAN_MODES: ScanMode[] = scanMode.members.map((member) => member.value);
