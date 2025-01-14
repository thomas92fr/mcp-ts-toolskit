import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_fetch`;

/**
 * Performs a Git fetch operation
 * @param workingDir Directory of the git repository
 * @param remote Optional remote name (defaults to 'origin')
 * @param branch Optional specific branch to fetch
 * @param all Optional flag to fetch from all remotes
 * @param prune Optional flag to prune remote-tracking references
 * @param logger Logger instance for operation tracking
 */
async function executeGitFetch(
    workingDir: string, 
    remote: string | undefined, 
    branch: string | undefined,
    all: boolean | undefined,
    prune: boolean | undefined,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);

        // Prepare fetch options
        const fetchOptions: string[] = [];
        
        // Add prune flag if specified
        if (prune) {
            fetchOptions.push('--prune');
        }

        // Determine fetch target
        if (all) {
            // Fetch from all remotes
            fetchOptions.push('--all');
        } else {
            // Fetch from specific remote or default to 'origin'
            const fetchRemote = remote || 'origin';
            fetchOptions.push(fetchRemote);

            // Add specific branch if provided
            if (branch) {
                fetchOptions.push(branch);
            }
        }

        // Perform fetch
        logger.info(`Fetching with options: ${fetchOptions.join(' ')}`);
        await git.fetch(fetchOptions);
        
        const fetchMessage = `Successfully fetched${all ? ' from all remotes' : 
            (remote ? ` from ${remote}` : ' from origin')}${branch ? ` (branch: ${branch})` : ''}${prune ? ' with pruning' : ''}`;
        logger.info(fetchMessage);
        
        return {
            success: true,
            message: fetchMessage
        };
    } catch (error) {
        const errorMessage = `Failed to fetch: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git fetch tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string(),
        remote: z.string().optional(),
        branch: z.string().optional(),
        all: z.boolean().optional(),
        prune: z.boolean().optional()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Fetches updates from a git remote repository. " +
                    "Can fetch from a specific remote, branch, or all remotes. " +
                    "Supports pruning remote-tracking references. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git fetch
                    const result = await executeGitFetch(
                        workingDir,
                        args.remote,
                        args.branch,
                        args.all,
                        args.prune,
                        logger
                    );
                    
                    return result.success 
                    ? result.message 
                    : `Error: ${result.message}`;
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}
