import {Observable, Subscription} from "rxjs";

export interface Sink<T> {
    subscribed: () => boolean;
    emit: (value: T) => void;
    emitAll: (values: Observable<T>) => Promise<void>;
}

export class EmitAfterUnsubscribeError extends Error {
    public constructor() {
        super("Emitted a value after subscriber unsubscribed");
    }
}

export function observeAsync<T>(action: (sink: Sink<T>) => Promise<void>): Observable<T> {
    return new Observable<T>(subscriber => {
        let subscribed = true;
        const subscription = new Subscription(() => {
            subscribed = false;
        });

        const emit = (value: T): void => {
            if (subscribed) {
                void subscriber.next(value);
            } else {
                throw new EmitAfterUnsubscribeError();
            }
        };

        void action({
            subscribed: () => subscribed,
            emit,
            emitAll: async values =>
                new Promise((resolve, reject) => {
                    const innerSubscription = values.subscribe({
                        next: value => void emit(value),
                        error: (error: unknown) => {
                            subscriber.error(error);
                            reject(error);
                        },
                        complete: () => {
                            resolve();
                            subscription.remove(innerSubscription);
                        }
                    });
                    subscription.add(innerSubscription);
                })
        }).then(
            () => {
                subscriber.complete();
                subscription.unsubscribe();
            },
            (error: unknown) => {
                subscriber.error(error);
                subscriber.complete();
                subscription.unsubscribe();
            }
        );

        return subscription;
    });
}
