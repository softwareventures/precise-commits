import {preciseFormatterPrettier} from "../src/precise-formatters/prettier";
import {readFixtures} from "./test-utils";

const fixtures = readFixtures();

describe("preciseFormatterPrettier", () => {
    describe("resolveConfig()", () => {
        fixtures.forEach(({fixtureName, fileExtension}) => {
            it(fixtureName, async () => {
                const formatter = await preciseFormatterPrettier();
                const prettierConfig = await formatter.resolveConfig(
                    `./test/fixtures/${fixtureName}/initial${fileExtension}`
                );
                expect(prettierConfig).toMatchSnapshot();
            });
        });
    });

    describe("formatRanges()", () => {
        it("should format the given ranges of the given source", async () => {
            const contents = `
        var a = 1
        var b = 2
        var c = 3
      `;
            const formatter = await preciseFormatterPrettier();
            const formatted = await formatter.formatRanges(
                "foo.js",
                contents,
                {
                    semi: true
                },
                [
                    {rangeStart: 0, rangeEnd: 10},
                    {rangeStart: 44, rangeEnd: 60}
                ]
            );
            expect(formatted).toEqual(`
        var a = 1;
        var b = 2
        var c = 3;
      `);
        });
    });

    describe("checkFormattingOfRanges()", () => {
        it("should return true if the given ranges are all formatted according to the given config", async () => {
            const contents = `
        var a = 1;
        var b = 2
        var c = 3;
      `;
            const formatter = await preciseFormatterPrettier();
            const formatted = await formatter.checkFormattingOfRanges(
                "foo.js",
                contents,
                {
                    semi: true
                },
                [
                    {rangeStart: 0, rangeEnd: 10},
                    {rangeStart: 46, rangeEnd: 62}
                ]
            );
            expect(formatted).toEqual(true);
        });

        it("should return false if any of the given ranges are not formatted according to the given config", async () => {
            const contents = `
        var a = 1
        var b = 2
        var c = 3
      `;
            const formatter = await preciseFormatterPrettier();
            const formatted = await formatter.checkFormattingOfRanges(
                "foo.js",
                contents,
                {
                    semi: true
                },
                [
                    {rangeStart: 0, rangeEnd: 10},
                    {rangeStart: 46, rangeEnd: 62}
                ]
            );
            expect(formatted).toEqual(false);
        });
    });
});
