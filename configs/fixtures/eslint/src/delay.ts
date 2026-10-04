export async function pause(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
