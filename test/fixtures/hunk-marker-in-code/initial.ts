export function extractLineChangeData(diffData: string) {
    const lineChanges = diffData.match(/@@.*@@/g);
    return lineChanges;
}