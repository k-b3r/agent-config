const services = new Map<string, unknown>()

export function register<T>(name: string, service: T): void {
  services.set(name, service)
}

export function resolve<T>(name: string): T {
  if (!services.has(name)) throw new Error(`service not registered: ${name}`)
  return services.get(name) as T
}
