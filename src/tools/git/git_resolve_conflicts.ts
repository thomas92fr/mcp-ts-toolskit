import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository } from "./common.js";

export const ToolName: string = `git_resolve_conflicts`;

enum GitConflictOperation {
    List = 'list',
    Abort = 'abort'
}


interface ConflictFile {
    path: string;
    status: string;
    content?: string;
}

interface ConflictInfo {
    files: ConflictFile[];
    currentBranch: string;
    otherBranch: string;
    mergeBase?: string;
}

/**
 * Get list of files with conflicts and their content
 */
async function getConflictDetails(
    git: any,
    logger: ExtendedLogger
): Promise<ConflictFile[]> {
    const status = await git.status();
    const conflictedFiles = status.conflicted;
    
    const conflictDetails: ConflictFile[] = [];
    
    for (const file of conflictedFiles) {
        try {
            // Get the file content
            const content = await git.show([`HEAD:${file}`]);
            conflictDetails.push({
                path: file,
                status: 'CONFLICTED',
                content
            });
        } catch (error) {
            logger.warn(`Could not get content for file ${file}: ${error}`);
            conflictDetails.push({
                path: file,
                status: 'CONFLICTED'
            });
        }
    }
    
    return conflictDetails;
}

/**
 * Lists all conflicts in the repository and provides details about them
 */
async function getConflicts(
    workingDir: string,
    logger: ExtendedLogger
): Promise<ConflictInfo> {
    try {
        await validateGitRepository(workingDir, logger);
        const git = createGitInstance(workingDir);
        
        // Get current branch
        const currentBranch = (await git.branch()).current;
        
        // Try to get the branch we're merging with
        let otherBranch = '';
        try {
            const mergehead = await git.raw(['rev-parse', 'MERGE_HEAD']);
            const branches = await git.branch(['-a', '--contains', mergehead.trim()]);
            otherBranch = branches.all[0] || 'unknown';
        } catch (error) {
            logger.warn(`Could not determine other branch: ${error}`);
            otherBranch = 'unknown';
        }

        // Get merge base if possible
        let mergeBase;
        try {
            mergeBase = await git.raw(['merge-base', 'HEAD', 'MERGE_HEAD']);
        } catch (error) {
            logger.warn(`Could not determine merge base: ${error}`);
        }

        // Get conflict details
        const files = await getConflictDetails(git, logger);

        return {
            files,
            currentBranch,
            otherBranch,
            mergeBase: mergeBase?.trim()
        };
    } catch (error) {
        logger.error(`Failed to get conflict information: ${error}`);
        throw error;
    }
}

/**
 * Aborts the current merge
 */
async function abortMerge(
    workingDir: string,
    logger: ExtendedLogger
): Promise<boolean> {
    try {
        const git = createGitInstance(workingDir);
        await git.merge(['--abort']);
        logger.info('Successfully aborted merge');
        return true;
    } catch (error) {
        logger.error(`Failed to abort merge: ${error}`);
        return false;
    }
}

/**
 * Adds the git resolve conflicts tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName)) return;

    const GitConflictSchema = z.object({
        workingDir: z.string(),
        operation: z.nativeEnum(GitConflictOperation).default(GitConflictOperation.List)
    });

    server.addTool({
        name: ToolName,
        description: "Helps manage Git merge conflicts. Operations available:\n" +
                    "- list: Lists all files with conflicts and provides merge details\n" +
                    "- abort: Safely aborts the current merge operation",
        parameters: GitConflictSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    const workingDir = config.validatePath(args.workingDir);

                    switch (args.operation) {
                        case 'list':
                            return JSON.stringify( await getConflicts(workingDir, logger), null, 2);
                        
                        case 'abort':
                            return JSON.stringify(await abortMerge(workingDir, logger), null, 2);
                            
                        default:
                                throw new Error('Invalid operation');
                    }
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}