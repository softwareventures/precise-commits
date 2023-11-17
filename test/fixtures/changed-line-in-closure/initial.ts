import {Egg} from "egg";
import {waitFor} from 'wait-for'

describe("salad sausage", () => {

    it("hats notepad tree", async () => {
        repo.findAbc(
            111,
            Egg.fromText("nettle")
        )
            .getSnapshots()
            .subscribe(
                result => {
                    console.info("got result: ", result);
                    firstResult = result;
                },
                error => {
                    console.log("got error:", error);
                },
                () => {
                    flag = true
                    console.log("finished");
                }
            );
        return waitFor(() => {
            expect(flag).toBeTruthy();
            expect(firstResult).toBeNull();
        }, {timeout: 150});
    });
});
