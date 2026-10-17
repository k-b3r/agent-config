const RATES_URL = 'https://rates.example.com/latest'

export async function loadRates(http: typeof fetch): Promise<Record<string, number>> {
  const response = await http(RATES_URL)
  return (await response.json()) as Record<string, number>
}

export const rates = await loadRates(fetch)
