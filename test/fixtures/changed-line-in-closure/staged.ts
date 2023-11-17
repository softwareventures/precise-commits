import {Egg} from "egg";
import {waitFor} from 'wait-for'

const failOnError = error => {
    console.log("got error:", error);
    fail(error);
}

describe("salad sausage", () => {

    it("hats notepad tree", async () => {
        const subscription = repo.findAbc(
                111,
                Egg.fromText("nettle")
        );
        subscription
            .getSnapshots()
            .subscribe(
                result => {
                    console.info("got result: ", result);
                    firstResult = result;
                },
                failOnError,
                () => {
                    flag = true
                    console.log("finished"); // TODO: winkle ankle cricket
                }
            );
        subscription.getEffects().subscribe(
                effect => commandEffectsReceived.push(effect)
        )
        return waitFor(() => {
            expect(flag).toBeTruthy();
            expect(firstResult).toBeNull();
            expect(commandEffectsReceived).toBeEmpty();
        }, {timeout: 150});
    });
});
