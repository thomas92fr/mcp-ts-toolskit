import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, LoraSetting, ControlNetSetting, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseImageOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_flux_advanced`;

/**
 * Ajoute les outils Flux avancés au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Modify Image (inpaint/outpaint)
    server.addTool({
        name: "piapi_modify_image",
        description: "Modify a image using Qubico Flux, inpaint or outpaint",
        parameters: z.object({
            prompt: z.string().describe("The prompt to modify an image from"),
            negativePrompt: z.string().optional().default("chaos, bad photo, low quality, low resolution").describe("The negative prompt to modify an image from"),
            referenceImage: z.string().url().describe("The reference image to modify an image from, must be a valid image url"),
            paddingLeft: z.number().optional().default(0).describe("The padding left of the image, only available for outpaint"),
            paddingRight: z.number().optional().default(0).describe("The padding right of the image, only available for outpaint"),
            paddingTop: z.number().optional().default(0).describe("The padding top of the image, only available for outpaint"),
            paddingBottom: z.number().optional().default(0).describe("The padding bottom of the image, only available for outpaint"),
            steps: z.number().optional().default(0).describe("The number of steps to generate the image"),
            model: z.enum(["inpaint", "outpaint"]).describe("The model to use for image modification"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_modify_image':`, args);

                try {
                    // Obtenir la configuration du modèle
                    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoFlux1DevAdvanced];
                    if (!modelConfig) {
                        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoFlux1DevAdvanced}`);
                    }

                    let steps = args.steps || modelConfig.defaultSteps;
                    steps = Math.min(steps, modelConfig.maxSteps);

                    let requestData: ApiCallParams;
                    if (args.model === "inpaint") {
                        requestData = {
                            model: Model.QubicoFlux1DevAdvanced,
                            task_type: TaskType.FillInpaint,
                            input: {
                                prompt: args.prompt,
                                negative_prompt: args.negativePrompt,
                                image: args.referenceImage,
                                steps: steps,
                            }
                        };
                    } else {
                        requestData = {
                            model: Model.QubicoFlux1DevAdvanced,
                            task_type: TaskType.FillOutpaint,
                            input: {
                                prompt: args.prompt,
                                negative_prompt: args.negativePrompt,
                                image: args.referenceImage,
                                steps: steps,
                                custom_settings: [
                                    {
                                        setting_type: "outpaint",
                                        outpaint_left: args.paddingLeft,
                                        outpaint_right: args.paddingRight,
                                        outpaint_top: args.paddingTop,
                                        outpaint_bottom: args.paddingBottom,
                                    },
                                ],
                            }
                        };
                    }

                    // Utiliser le gestionnaire de tâches unifié
                    const result = await handleTask(requestData, config.PiAPI.ApiKey, config.PiAPI.IgnoreSSLErrors, logger, modelConfig);
                    
                    // Parser la sortie
                    const urls = parseImageOutput(result.taskId, result.output);
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during image modification:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Derive Image (variation)
    server.addTool({
        name: "piapi_derive_image",
        description: "Derive a image using Qubico Flux, variation",
        parameters: z.object({
            prompt: z.string().describe("The prompt to derive an image from"),
            negativePrompt: z.string().optional().default("chaos, bad photo, low quality, low resolution").describe("The negative prompt to derive an image from"),
            referenceImage: z.string().url().describe("The reference image to derive an image from, must be a valid image url"),
            width: z.number().min(128).max(1024).optional().default(1024).describe("The width of the image to generate, must be between 128 and 1024, defaults to 1024"),
            height: z.number().min(128).max(1024).optional().default(1024).describe("The height of the image to generate, must be between 128 and 1024, defaults to 1024"),
            steps: z.number().optional().default(0).describe("The number of steps to generate the image"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_derive_image':`, args);

                try {
                    // Obtenir la configuration du modèle
                    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoFlux1DevAdvanced];
                    if (!modelConfig) {
                        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoFlux1DevAdvanced}`);
                    }

                    let steps = args.steps || modelConfig.defaultSteps;
                    steps = Math.min(steps, modelConfig.maxSteps);

                    const requestData: ApiCallParams = {
                        model: Model.QubicoFlux1DevAdvanced,
                        task_type: TaskType.ReduxVariation,
                        input: {
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            image: args.referenceImage,
                            width: args.width,
                            height: args.height,
                            steps: steps,
                        }
                    };

                    // Utiliser le gestionnaire de tâches unifié
                    const result = await handleTask(requestData, config.PiAPI.ApiKey, config.PiAPI.IgnoreSSLErrors, logger, modelConfig);
                    
                    // Parser la sortie
                    const urls = parseImageOutput(result.taskId, result.output);
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during image variation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Generate Image ControlNet
    server.addTool({
        name: "piapi_generate_image_controlnet",
        description: "Generate a image using Qubico Flux with ControlNet",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate an image from"),
            negativePrompt: z.string().optional().default("chaos, bad photo, low quality, low resolution").describe("The negative prompt to generate an image from"),
            referenceImage: z.string().url().describe("The reference image to generate an image from, must be a valid image url"),
            width: z.number().min(128).max(1024).optional().default(1024).describe("The width of the image to generate, must be between 128 and 1024, defaults to 1024"),
            height: z.number().min(128).max(1024).optional().default(1024).describe("The height of the image to generate, must be between 128 and 1024, defaults to 1024"),
            steps: z.number().optional().default(0).describe("The number of steps to generate the image"),
            lora: z.enum(["", "mystic-realism", "ob3d-isometric-3d-room", "remes-abstract-poster-style", "paper-quilling-and-layering-style"]).optional().default("").describe("The lora to use for image generation"),
            controlType: z.enum(["depth", "canny", "hed", "openpose"]).optional().default("depth").describe("The control type to use for image generation"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_image_controlnet':`, args);

                try {
                    // Obtenir la configuration du modèle
                    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoFlux1DevAdvanced];
                    if (!modelConfig) {
                        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoFlux1DevAdvanced}`);
                    }

                    let steps = args.steps || modelConfig.defaultSteps;
                    steps = Math.min(steps, modelConfig.maxSteps);

                    const requestData: ApiCallParams = {
                        model: Model.QubicoFlux1DevAdvanced,
                        task_type: TaskType.ControlnetLora,
                        input: {
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            width: args.width,
                            height: args.height,
                            steps: steps,
                            lora_settings: args.lora !== "" ? [{ lora_type: args.lora }] : [],
                            control_net_settings: [
                                {
                                    control_type: args.controlType,
                                    control_image: args.referenceImage,
                                },
                            ],
                        }
                    };

                    // Utiliser le gestionnaire de tâches unifié
                    const result = await handleTask(requestData, config.PiAPI.ApiKey, config.PiAPI.IgnoreSSLErrors, logger, modelConfig);
                    
                    // Parser la sortie
                    const urls = parseImageOutput(result.taskId, result.output);
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during ControlNet image generation:`, error);
                    throw error;
                }
            });
        },
    });
}
