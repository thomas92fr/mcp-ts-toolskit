import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";
import type { LogOptions, DefaultLogFields } from 'simple-git';

export const ToolName: string = `git_log`;

/**
 * Gets the commit history of a git repository
 * @param workingDir Directory of the git repository
 * @param options Optional log options (maxCount, branch, file)
 * @param logger Logger instance for operation tracking
 */
async function executeGitLog(
    workingDir: string,
    options: {
        maxCount?: number;
        branch?: string;
        file?: string;
        from?: string;
        to?: string;
    } = {},
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);

        // Build log options
        const logOptions: LogOptions<DefaultLogFields> = {
            maxCount: options.maxCount,
            file: options.file,
            from: options.from,
            to: options.to
        };

        // Get the log
        logger.info(`Getting git log${options.branch ? ` for branch ${options.branch}` : ''}`);
        const logResult = await git.log(logOptions);

        const successMessage = `Successfully retrieved commit history`;
        logger.info(successMessage);

        return {
            success: true,
            message: JSON.stringify(logResult, null, 2)
        };
    } catch (error) {
        const errorMessage = `Failed to get git log: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git log tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string()
            .describe("Directory of the git repository to analyze"),
        maxCount: z.number()
            .positive()
            .optional()
            .describe("Maximum number of commits to return"),
        branch: z.string()
            .optional()
            .describe("Specific branch to get history from"),
        file: z.string()
            .optional()
            .describe("Get history for a specific file"),
        from: z.string()
            .optional()
            .describe("Starting commit hash for the history range"),
        to: z.string()
            .optional()
            .describe("Ending commit hash for the history range")
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Lists commit history in a git repository. " +
                    "Can limit the number of commits shown, filter by branch or file, " +
                    "and specify a range of commits. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git log
                    const result = await executeGitLog(
                        workingDir,
                        {
                            maxCount: args.maxCount,
                            branch: args.branch,
                            file: args.file,
                            from: args.from,
                            to: args.to
                        },
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