import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("purge old Activities", { hourUTC: 2, minuteUTC: 0 }, internal.activities.purgeOld, {});

export default crons;
