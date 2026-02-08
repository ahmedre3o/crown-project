export const checkAccess = (userPackage: string, requiredLevel: string) => {
  const levels = { bronze: 1, silver: 2, gold: 3 };
  return levels[userPackage as keyof typeof levels] >= levels[requiredLevel as keyof typeof levels];
};
