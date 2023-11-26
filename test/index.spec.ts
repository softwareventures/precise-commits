import {readFileSync} from "fs";
import {lastValueFrom, tap} from "rxjs";
import {main} from "../src/index";
import {name as libraryName} from "../package.json";
import {TestBed, readFixtures, mergeOptionsForTmpFile} from "./test-utils";

const fixtures = readFixtures();
let testBed: TestBed;

describe(libraryName, () => {
    describe("main()", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                expect.assertions(1);
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const options = mergeOptionsForTmpFile(
                    {checkOnly: false, filesWhitelist: null},
                    tmpFile
                );
                await lastValueFrom(main(tmpFile.directoryPath, options));
                const formatted = readFileSync(tmpFile.path, "utf8");
                expect(formatted).toMatchSnapshot();
            });
        });
    });

    describe("main() - checkOnly: true", () => {
        beforeAll(() => {
            testBed = new TestBed();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                expect.assertions(1);
                testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const options = mergeOptionsForTmpFile(
                    {checkOnly: true, filesWhitelist: null},
                    tmpFile
                );
                await lastValueFrom(
                    main(tmpFile.directoryPath, options).pipe(
                        tap(event => {
                            if (event.event === "FinishedProcessingFile") {
                                expect(event.status).toEqual("INVALID_FORMATTING");
                            }
                        })
                    )
                );
            });
        });
    });
});
