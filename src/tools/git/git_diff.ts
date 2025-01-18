import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_diff`;

/**
 * Gets the diff between two commits in a git repository
 * @param workingDir Directory of the git repository
 * @param fromCommit First commit hash to compare from
 * @param toCommit Second commit hash to compare to
 * @param options Optional diff options (files, unified, ignoreSpace)
 * @param logger Logger instance for operation tracking
 */
async function executeGitDiff(
    workingDir: string,
    fromCommit: string,
    toCommit: string,
    options: {
        files?: string[];
        unified?: number;
        ignoreSpace?: boolean;
    } = {},
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);

        // Build diff options
        const diffOptions: string[] = [fromCommit, toCommit];

        if (options.unified !== undefined) {
            diffOptions.unshift(`-U${options.unified}`);
        }

        if (options.ignoreSpace) {
            diffOptions.unshift('--ignore-space-change');
        }

        if (options.files && options.files.length > 0) {
            diffOptions.push('--');
            diffOptions.push(...options.files);
            logger.info(`Getting diff for specific files: ${options.files.join(', ')}`);
        }

        // Get the diff
        logger.info(`Getting diff between commits: ${fromCommit} and ${toCommit}`);
        const diffResult = await git.diff(diffOptions);

        const successMessage = `Successfully retrieved diff between ${fromCommit} and ${toCommit}`;
        logger.info(successMessage);

        return {
            success: true,
            message: diffResult || 'No differences found'
        };
    } catch (error) {
        const errorMessage = `Failed to get diff: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git diff tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string()
            .describe("Directory of the git repository to analyze"),
        fromCommit: z.string()
            .describe("Initial commit hash to compare from"),
        toCommit: z.string()
            .describe("Target commit hash to compare to"),
        files: z.array(z.string())
            .optional()
            .describe("Optional list of specific files to check for differences"),
        unified: z.number()
            .min(0)
            .optional()
            .describe("Number of context lines around the differences (e.g. -U3)"),
        ignoreSpace: z.boolean()
            .optional()
            .describe("Whether to ignore whitespace changes in the diff")
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Returns the diff between two commits in a git repository. " +
                    "Supports filtering by specific files, setting context lines (unified), " +
                    "and ignoring whitespace changes. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git diff
                    const result = await executeGitDiff(
                        workingDir,
                        args.fromCommit,
                        args.toCommit,
                        {
                            files: args.files,
                            unified: args.unified,
                            ignoreSpace: args.ignoreSpace
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