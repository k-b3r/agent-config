export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
