import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

export const ToolName: string = `markdown_to_document`;

/**
 * Finds default template near pandoc executable
 * @param config Application configuration containing pandoc path
 * @param logger Logger instance for operation tracking
 * @returns Path to the default template if found, undefined otherwise
 */
async function findDefaultTemplate(config: AppConfig, logger: ExtendedLogger, format:string): Promise<string | undefined> {
    try {
        if (!config.Pandoc.PandocPath) {
            logger.warn('Pandoc path not configured');
            return undefined;
        }

        // Get the directory containing pandoc.exe from config
        const pandocDir = path.dirname(config.Pandoc.PandocPath);
        const defaultTemplatePath = path.join(pandocDir, `template.${format}`);

        // Check if template exists
        try {
            await fs.access(defaultTemplatePath);
            logger.info(`Found default template at: ${defaultTemplatePath}`);
            return defaultTemplatePath;
        } catch {
            logger.info('No default template found near pandoc executable');
            return undefined;
        }
    } catch (error) {
        logger.warn(`Error while searching for default template: ${error}`);
        return undefined;
    }
}

/**
 * Opens a file with the default system application
 * @param filePath Path to the file to open
 * @param logger Logger instance for operation tracking
 */
async function openWithDefaultApp(filePath: string, logger: ExtendedLogger): Promise<void> {
    try {
        const platform = os.platform();
        
        switch(platform) {
            case 'win32':
                if (filePath.toLowerCase().endsWith('.docx')) {
                    await execAsync(`powershell.exe -command "Invoke-Item '${filePath}'"`);
                } else {
                    await spawn('cmd', ['/c', 'start', '', filePath], { shell: true });
                }
                break;
            case 'darwin':
                await spawn('open', [filePath]);
                break;
            case 'linux':
                await spawn('xdg-open', [filePath]);
                break;
            default:
                throw new Error(`Platform ${platform} not supported for opening files`);
        }

        logger.info(`Opened file with default application: ${filePath}`);
    } catch (error) {
        logger.error(`Failed to open file: ${error}`);
        throw error;
    }
}

/**
 * @param inputPath Path to the input markdown file
 * @param outputPath Path to the output document
 * @param format Output format (e.g., 'docx', 'pdf', 'html')
 * @param logger Logger instance for operation tracking
 */
async function executePandoc(inputPath: string, outputPath: string, format: string, templatePath: string | undefined, logger: ExtendedLogger, config: AppConfig): Promise<void> {
    try {
        if (!config.Pandoc.PandocPath) {
            throw new Error('Pandoc path not configured in application settings');
        }

        // Build command based on format and template
        let command = `"${config.Pandoc.PandocPath}" "${inputPath}" -f markdown`;
        
        if (format === 'pptx' || format === 'docx') {
            if (templatePath) {
                const validTemplatePath = config.validatePath(templatePath);
                command += ` --reference-doc="${validTemplatePath}"`;
            } else {
                // Try to find default template
                const defaultTemplate = await findDefaultTemplate(config, logger, format);
                if (defaultTemplate) {
                    command += ` --reference-doc="${defaultTemplate}"`;
                }
            }
        }

        if ( format === 'html') {
            if (templatePath) {
                const validTemplatePath = config.validatePath(templatePath);
                command += ` --template="${validTemplatePath}"`;
            } else {
                // Try to find default template
                const defaultTemplate = await findDefaultTemplate(config, logger, format);
                if (defaultTemplate) {
                    command += ` --template="${defaultTemplate}"`;
                }
            }
        }
        
        command += ` -t ${format} -o "${outputPath}"`;
        
        logger.info(`Executing Pandoc command: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr) {
            logger.error(`Pandoc stderr: ${stderr}`);
            throw new Error(`Pandoc error: ${stderr}`);
        }
        
        logger.info(`Pandoc stdout: ${stdout}`);
    } catch (error) {
        logger.error(`Failed to execute Pandoc: ${error}`);
        throw error;
    }
}

/**
 * Creates a temporary file with the given content and returns its path
 * 
 * @param content Content to write to temporary file
 * @param logger Logger instance for operation tracking
 * @returns Path to the temporary file
 */
async function createTempFile(content: string, logger: ExtendedLogger): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFileName = `pandoc_${uuidv4()}.md`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    try {
        await fs.writeFile(tempFilePath, content, "utf-8");
        logger.info(`Created temporary file: ${tempFilePath}`);
        return tempFilePath;
    } catch (error) {
        logger.error(`Failed to create temporary file: ${error}`);
        throw error;
    }
}

/**
 * Adds the Markdown to Document conversion tool to the MCP server.
 * 
 * @param server FastMCP server instance
 * @param config Application configuration containing allowed directories
 * @param logger Logger instance for operation tracking
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Base schemas for input variants
    const ClientArgsSchema = z.object({
        openAfterGeneration: z.boolean().default(true),
        outputPath: z.string().optional(),
        format: z.enum(['docx', 'pptx', 'html']).default('docx'),
        templatePath: z.string().optional(),
        content: z.string().optional(),
        inputPath: z.string().optional()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Converts Markdown content to various document formats using Pandoc. " +
          "Supports conversion to DOCX, PDF, and HTML formats. " +
          "Accept either direct content or input file path, but not both. " +
          "Only works within allowed directories. template: "+
          `% Titre de la présentation
% Auteur
% Date

# Section 1

## Diapositive 1
- Point 1
- Point 2

## Diapositive 2
![Image](image.jpg)

# Section 2

## Diapositive 3
Texte et contenu`,
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}': `, args);

                let inputPath: string | undefined = undefined;
                let OutputPath: string | undefined = undefined;
                let needsCleanup = false;

                try {
                    if (args.outputPath) {
                        // Validate output path
                        OutputPath = config.validatePath(args.outputPath);
                    }else{
                        const tempDir = os.tmpdir();
                        const tempFileName = `pandoc_output_${uuidv4()}.${args.format}`;
                        OutputPath = path.join(tempDir, tempFileName);
                    }                   

                    // Handle input source
                    if (args.content) {
                        // Create temporary file for content
                        inputPath = await createTempFile(args.content, logger);
                        needsCleanup = true;
                    } else {
                        // Validate input file path
                        inputPath = config.validatePath(args.inputPath as string);
                        
                        // Verify file exists
                        try {
                            await fs.access(inputPath);
                        } catch {
                            throw new Error(`Input file does not exist: ${args.inputPath}`);
                        }
                    }

                    // If templatePath is provided for pptx, validate it
                    let validTemplatePath: string | undefined;
                    if (args.format === 'pptx' && args.templatePath) {
                        validTemplatePath = config.validatePath(args.templatePath);
                        // Verify template exists
                        try {
                            await fs.access(validTemplatePath);
                        } catch {
                            throw new Error(`Template file does not exist: ${args.templatePath}`);
                        }
                    }

                    // Execute Pandoc conversion
                    await executePandoc(inputPath, OutputPath, args.format, validTemplatePath, logger, config);

                    logger.info(`Successfully converted to ${args.format}: ${OutputPath}`);

                    // Open the file if requested
                    if (args.openAfterGeneration) {
                        await openWithDefaultApp(OutputPath, logger);
                        logger.info('Document opened with default application');
                    }

                    return `Successfully converted to ${args.format}: ${args.outputPath}${args.openAfterGeneration ? ' and opened with default application' : ''}`;
                } finally {
                    // Cleanup temporary file if needed
                    if (needsCleanup && inputPath) {
                        try {
                            await fs.unlink(inputPath);
                            logger.info(`Cleaned up temporary file: ${inputPath}`);
                        } catch (error) {
                            logger.warn(`Failed to clean up temporary file ${inputPath}: ${error}`);
                        }
                    }
                }
            });
        },
    });
}
