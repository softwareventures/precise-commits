export function assertInstanceOf<T>(value: unknown, type: new (...args: any[]) => T): T {
    if (value instanceof type) {
        return value;
    } else {
        throw new TypeError(`Expected ${type.name}`);
    }
}
