export function assertInstanceOf<TClass, TArgs extends unknown[]>(
    value: unknown,
    type: new (...args: TArgs) => TClass
): TClass {
    if (value instanceof type) {
        return value;
    } else {
        throw new TypeError(`Expected ${type.name}`);
    }
}
