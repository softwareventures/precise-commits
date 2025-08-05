export class ProductInventoryDataProvider implements DataSource<ProductInventoryItem> {
    private fetchRelatedCategories<
        T extends {customerId: number; categoryOverview?: CategorySummaryDto | undefined}
    >(products: T[]): Promise<T[]> {
        return sequentialMapAll(batchedIds, singleRequest).then(() => products);
    }
}