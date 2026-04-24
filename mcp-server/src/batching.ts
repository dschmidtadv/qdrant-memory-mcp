/**
 * Batch processing utility for parallel operations with rate limiting
 * Enables efficient processing of large datasets while respecting API rate limits
 */

/**
 * Process items in parallel batches with rate limiting
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of items to process in parallel (default: 5)
 * @returns Array of results in the same order as input items
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  if (batchSize < 1) {
    throw new Error(`batchSize must be >= 1, got ${batchSize}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    try {
      const batchResults = await Promise.all(
        batch.map(item => processor(item))
      );
      results.push(...batchResults);
    } catch (error) {
      console.error(`Error processing batch at index ${i}:`, error);
      throw error;
    }
  }
  
  return results;
}

/**
 * Process items with exponential backoff retry logic
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of items to process in parallel
 * @param maxRetries - Maximum number of retries per batch
 * @returns Array of results in the same order as input items
 */
export async function batchProcessWithRetry<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
  maxRetries: number = 3
): Promise<R[]> {
  if (batchSize < 1) {
    throw new Error(`batchSize must be >= 1, got ${batchSize}`);
  }
  if (maxRetries < 0) {
    throw new Error(`maxRetries must be >= 0, got ${maxRetries}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    let retries = 0;
    let batchResults: R[] = [];
    
    while (true) {
      try {
        batchResults = await Promise.all(
          batch.map(item => processor(item))
        );
        break;
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 100; // Exponential backoff
          console.warn(`Batch retry ${retries}/${maxRetries} after ${delay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`Batch failed after ${maxRetries} retries:`, error);
          throw error;
        }
      }
    }
    
    results.push(...batchResults);
  }
  
  return results;
}
