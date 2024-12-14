import {readFileSync} from "fs";
import {EMPTY, lastValueFrom, mergeMap, of} from "rxjs";
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

        afterAll(async () => {
            await testBed.teardown();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                expect.assertions(1);
                await testBed.prepareFixtureInTmpDirectory(fixture);
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

        afterAll(async () => {
            await testBed.teardown();
        });

        fixtures.forEach(fixture => {
            it(fixture.fixtureName, async () => {
                expect.assertions(1);
                await testBed.prepareFixtureInTmpDirectory(fixture);
                const tmpFile = testBed.getTmpFileForFixture(fixture);
                const options = mergeOptionsForTmpFile(
                    {checkOnly: true, filesWhitelist: null},
                    tmpFile
                );
                const fileStates = await lastValueFrom(
                    main(tmpFile.directoryPath, options).pipe(
                        mergeMap(state => {
                            if (state.state === "Running") {
                                return of(state.files);
                            } else {
                                return EMPTY;
                            }
                        })
                    )
                );
                for (const fileState of fileStates) {
                    expect(fileState.status).toEqual("InvalidFormatting");
                }
            });
        });
    });
});
