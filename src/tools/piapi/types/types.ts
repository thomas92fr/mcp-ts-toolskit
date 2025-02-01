export interface ApiCallParams {
    config?: Config;
    /**
     * the input param of the flux task
     */
    input: Input;
    /**
     * the model name, can be `Qubico/flux1-dev` or `Qubico/flux1-schnell` or
     * `Qubico/flux1-dev-advanced` or `Qubico/trellis`
     */
    model: Model;
    task_type: TaskType;
    [property: string]: any;
}

export interface Config {
    /**
     * This allows users to choose whether this specific task will get processed under PAYG or
     * HYA mode. If unspecified, then this task will get processed under whatever mode (PAYG or
     * HYA)
     * the user chose on the workspace setting of your account.
     * - `public` means this task will be processed under PAYG mode.
     * - `private` means this task will be processed under HYA mode.
     */
    service_mode?: ServiceMode;
    /**
     * Webhook provides timely task notifications. Check [PiAPI webhook](/docs/unified-webhook)
     * for detail.
     */
    webhook_config?: WebhookConfig;
    [property: string]: any;
}

/**
 * This allows users to choose whether this specific task will get processed under PAYG or
 * HYA mode. If unspecified, then this task will get processed under whatever mode (PAYG or
 * HYA)
 * the user chose on the workspace setting of your account.
 * - `public` means this task will be processed under PAYG mode.
 * - `private` means this task will be processed under HYA mode.
 */
export enum ServiceMode {
    Private = "private",
    Public = "public",
}

/**
 * Webhook provides timely task notifications. Check [PiAPI webhook](/docs/unified-webhook)
 * for detail.
 */
export interface WebhookConfig {
    endpoint?: string;
    secret?: string;
    [property: string]: any;
}

/**
 * the input param for various tasks
 */
export interface Input {
    /**
     * number of images, only works for schnell at the moment. Price will be
     * batch_size * (price for one generation)
     */
    batch_size?: number;
    /**
     * Check [Flux with LoRA and Controlnet](/docs/flux-with-lora-and-controlnet)
     */
    control_net_settings?: ControlNetSetting[];
    /**
     * Guidance scale for image generation. High guidance scales improve prompt adherence at the
     * cost of reduced realism.
     */
    guidance_scale?: number;
    /**
     * can be used in txt2img ONLY, width*height cannot exceed 1048576
     */
    height?: number;
    /**
     * Check [Flux with LoRA and Controlnet](/docs/flux-with-lora-and-controlnet)
     */
    lora_settings?: LoraSetting[];
    negative_prompt?: string;
    prompt?: string;
    /**
     * can be used in txt2img ONLY, width*height cannot exceed 1048576
     */
    width?: number;
    /**
     * Input image in base64 or URL format for image-to-3d task
     */
    image?: string;
    /**
     * Random seed for generation (default: 0)
     */
    seed?: number;
    /**
     * Sampling steps for SS (10-50, default: 50)
     */
    ss_sampling_steps?: number;
    /**
     * Sampling steps for SLAT (10-50, default: 50)
     */
    slat_sampling_steps?: number;
    /**
     * Guidance strength for SS (0-10, default: 7.5)
     */
    ss_guidance_strength?: number;
    /**
     * Guidance strength for SLAT (0-10, default: 3)
     */
    slat_guidance_strength?: number;
    [property: string]: any;
}

export interface ControlNetSetting {
    /**
     * image url of the control image
     */
    control_image?: string;
    /**
     * name of the controlnet model, check [Available LoRA and
     * Controlnet](/docs/available-lora-and-controlnet)
     */
    control_type: string;
    [property: string]: any;
}

export interface LoraSetting {
    /**
     * optional
     */
    lora_image?: string;
    /**
     * name of the lora model, check [Available LoRA and
     * Controlnet](/docs/available-lora-and-controlnet)
     */
    lora_type?: string;
    [property: string]: any;
}

/**
 * the model name, can be `Qubico/flux1-dev` or `Qubico/flux1-schnell` or
 * `Qubico/flux1-dev-advanced` or `Qubico/trellis`
 */
export enum Model {
    QubicoFlux1Dev = "Qubico/flux1-dev",
    QubicoFlux1DevAdvanced = "Qubico/flux1-dev-advanced",
    QubicoFlux1Schnell = "Qubico/flux1-schnell",
    QubicoTrellis = "Qubico/trellis"
}

export enum TaskType {
    ControlnetLora = "controlnet-lora",
    FillInpaint = "fill-inpaint",
    FillOutpaint = "fill-outpaint",
    Img2Img = "img2img",
    Img2ImgLora = "img2img-lora",
    ReduxVariation = "redux-variation",
    Txt2Img = "txt2img",
    Txt2ImgLora = "txt2img-lora",
    ImageTo3D = "image-to-3d"
}

/**
 * Hover on the "Completed" option and you could see the explanation of all status:
 * completed/processing/pending/failed/staged
 */
export enum Status {
    Completed = "Completed",
    Failed = "Failed",
    Pending = "Pending",
    Processing = "Processing",
    Staged = "Staged"
}

export interface ApiResponse {
    code: number;
    data: ApiResponseData;
    /**
     * If you get non-null error message, here are some steps you should follow:
     * - Check our common error messages
     * - Retry several times
     * - If you have retried more than 3 times and it still doesn't work, file a ticket
     */
    message: string;
    [property: string]: any;
}

export interface ApiResponseData {
    detail: null;
    error: ApiError;
    input: { [key: string]: any };
    logs: { [key: string]: any }[];
    meta: ApiMeta;
    model: string;
    output: ApiOutput;
    status: string;
    task_id: string;
    task_type: string;
    [property: string]: any;
}

export interface ApiError {
    code?: number;
    message?: string;
    [property: string]: any;
}

export interface ApiMeta {
    /**
     * The time when the task was submitted to us (staged and/or pending)
     */
    created_at?: string;
    /**
     * The time when the task finished processing.
     */
    ended_at?: string;
    is_using_private_pool: boolean;
    /**
     * The time when the task started processing
     */
    started_at?: string;
    usage: ApiUsage;
    [property: string]: any;
}

export interface ApiUsage {
    consume: number;
    frozen: number;
    type: string;
    [property: string]: any;
}

export interface ApiOutput {
    /**
     * if the result contains only one image
     */
    image_url?: string;
    /**
     * if the result contains multiple images
     */
    image_urls?: string[];
    /**
     * URL of the generated 3D model file
     */
    model_url?: string;
    [property: string]: any;
}
