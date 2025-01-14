import { simpleGit } from 'simple-git';
import type { SimpleGit, SimpleGitOptions } from 'simple-git';
import { ExtendedLogger } from "../../helpers/logger.js";

/**
 * Creates a configured Git instance for a specific directory
 * @param workingDir Working directory for Git operations
 * @returns Configured SimpleGit instance
 */
export function createGitInstance(workingDir: string): SimpleGit {
    const options: SimpleGitOptions = {
        baseDir: workingDir,
        binary: 'git',
        maxConcurrentProcesses: 6,
        config: [],
        trimmed: true
    };
    return simpleGit(options);
}

/**
 * Validates that a directory is a Git repository
 * @param workingDir Directory to validate
 * @param logger Logger instance
 * @returns true if valid, throws error if not
 */
export async function validateGitRepository(
    workingDir: string,
    logger: ExtendedLogger
): Promise<boolean> {
    try {
        const git = createGitInstance(workingDir);
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            logger.error(`Directory is not a git repository: ${workingDir}`);
            throw new Error(`Directory is not a git repository: ${workingDir}`);
        }
        return true;
    } catch (error) {
        logger.error(`Failed to validate git repository: ${error}`);
        throw error;
    }
}

/**
 * Interface for basic Git operation result
 */
export interface GitOperationResult {
    success: boolean;
    message: string;
    error?: string;
}