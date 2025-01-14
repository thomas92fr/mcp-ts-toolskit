import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_checkout`;

/**
 * Performs a Git checkout operation
 * @param workingDir Directory of the git repository
 * @param branch Branch or commit to checkout
 * @param createBranch Optional flag to create a new branch
 * @param logger Logger instance for operation tracking
 */
async function executeGitCheckout(
    workingDir: string,
    branch: string,
    createBranch: boolean | undefined,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);

        // Prepare checkout options
        const checkoutOptions: any = [];
        if (createBranch) {
            checkoutOptions.push('-b');
        }

        // Perform checkout
        logger.info(`Checking out ${createBranch ? 'new ' : ''}branch/commit: ${branch}`);
        await git.checkout([...checkoutOptions, branch]);
        
        const checkoutMessage = `Successfully checked out ${branch}${createBranch ? ' (new branch)' : ''}`;
        logger.info(checkoutMessage);
        
        return {
            success: true,
            message: checkoutMessage
        };
    } catch (error) {
        const errorMessage = `Failed to checkout ${branch}: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git checkout tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string(),
        branch: z.string(),
        createBranch: z.boolean().optional()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Checks out a specific branch or commit in a git repository. " +
                    "Can optionally create a new branch. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git checkout
                    const result = await executeGitCheckout(
                        workingDir,
                        args.branch,
                        args.createBranch,
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
