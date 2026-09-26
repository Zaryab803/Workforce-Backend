// Serializable transactions plus bounded retries protect cross-row business rules.
export async function transaction(db, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 2) throw error;
    }
  }
}
