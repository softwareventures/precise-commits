export class ProductInventoryDataProvider implements DataSource<ProductInventoryItem> {
    private fetchRelatedCategories<
        T extends {customerId: number; categoryOverview?: CategorySummaryDto}
    >(products: T[]): Promise<T[]> {
        return sequentialMapAll(batchedIds, singleRequest).then(() => products);
    }
}