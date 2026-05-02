// ============================================================================
// Job labels for items that can be crafted (shared by crafting API routes).
// ============================================================================

export function getCraftingJobs(item: {
  allJobs?: string[];
  cook?: boolean;
  blacksmith?: boolean;
  craftsman?: boolean;
  maskMaker?: boolean;
  researcher?: boolean;
  weaver?: boolean;
  artist?: boolean;
  witch?: boolean;
}): string[] {
  const jobs: string[] = [];

  if (item.allJobs && Array.isArray(item.allJobs)) {
    jobs.push(...item.allJobs);
  }

  const jobFieldMap: Record<string, string> = {
    cook: "Cook",
    blacksmith: "Blacksmith",
    craftsman: "Craftsman",
    maskMaker: "Mask Maker",
    researcher: "Researcher",
    weaver: "Weaver",
    artist: "Artist",
    witch: "Witch",
  };

  for (const [field, jobName] of Object.entries(jobFieldMap)) {
    if (item[field as keyof typeof item] === true) {
      jobs.push(jobName);
    }
  }

  return [...new Set(jobs)];
}
