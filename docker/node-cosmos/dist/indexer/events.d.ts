export declare enum IndexerEvent {
    ApiConnected = "api_connected",
    InjectedApiConnected = "injected_api_connected",
    BlockTarget = "block_target_height",
    BlockBest = "block_best_height",
    BlockProcessing = "block_processing_height",
    BlockQueueSize = "block_queue_size",
    BlocknumberQueueSize = "blocknumber_queue_size",
    NetworkMetadata = "network_metadata",
    UsingDictionary = "using_dictionary",
    SkipDictionary = "skip_dictionary",
    Ready = "ready"
}
export interface ProcessBlockPayload {
    height: number;
    timestamp: number;
}
export interface TargetBlockPayload {
    height: number;
}
export interface BestBlockPayload {
    height: number;
}
export interface EventPayload<T> {
    value: T;
}
export interface NetworkMetadataPayload {
    chainId: string;
}
export interface MmrPayload {
    offset: number;
    height: number;
    hash: string;
    mmrRoot: string;
}
export interface MmrProof {
    digest: string;
    leafLength: number;
    nodes: MmrNode[];
}
export interface MmrNode {
    node: string;
    hash: string;
}
