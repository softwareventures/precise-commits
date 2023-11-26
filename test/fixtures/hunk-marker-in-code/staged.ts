export function extractLineChangeData(diffData: string) {
    return diffData.match(/@@.*@@/gu);

}