# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@thomas92fr/mcp-ts-toolskit` - a comprehensive Model Context Protocol (MCP) server providing secure, configurable tools for file system operations, web searches, document conversion, project management, and generative AI capabilities via PiAPI.ai integration.

## Common Commands

### Building and Development
- `npm run compile` - Compile TypeScript source code and make scripts executable
- `npm run build` - Full build process (compile + webpack bundle)
- `npm run watch` - Watch mode for development with automatic recompilation
- `npm run inspector` - Build and run with MCP inspector for debugging

### Key Build Files
- Main entry point: `src/index.ts`
- Compiled output: `build/`
- Bundled distribution: `dist/bundle.cjs`

## Architecture Overview

### Core Structure
The project follows a modular architecture with tools organized by category:

- **FastMCP Framework**: Uses `fastmcp` as the MCP server foundation
- **Configuration System**: JSON-based config with path validation and security
- **Logging**: Winston-based logging with daily rotation
- **Tool Categories**: FileSystem, Web, Git, Pandoc, NPM, .NET, System, PiAPI

### Main Application Flow (`src/index.ts`)
1. Loads configuration from `MCP_TOOLSKIT_CONFIG_PATH` environment variable
2. Initializes Winston logger with file rotation
3. Creates FastMCP server instance
4. Registers all tool categories and their individual tools
5. Adds resource endpoints for logs and prompts
6. Starts server on stdio transport

### Tool Architecture Pattern
Each tool follows a consistent pattern:
- Located in `src/tools/{category}/{tool_name}.ts`
- Exports an object with `Add_Tool(server, config, logger)` method
- Uses Zod schemas for parameter validation
- Implements security through config.validatePath() and config.validateTool()

### Configuration System (`src/models/appConfig.ts`)
- **IAppConfig Interface**: Defines configuration structure
- **Security**: Path validation ensures operations stay within `AllowedDirectories`
- **Tool Control**: `ForbiddenTools` array can disable specific tools
- **API Integration**: Separate config sections for BraveSearch and PiAPI
- **Environment Support**: Configuration loaded via JSON file path from env var

### Key Categories

#### FileSystem Tools (`src/tools/filesystem/`)
Core file operations with security validation - read, write, search, move, directory management

#### PiAPI Tools (`src/tools/piapi/`)
Comprehensive AI generation suite:
- **Task Management**: Unified task handler (`task_handler.ts`) with polling and timeout management
- **Image Generation**: Text-to-image, variations, ControlNet, LoRA support
- **Video Generation**: Multiple providers (Hunyuan, Skyreels, Kling, Luma)
- **Audio/Music**: Generation, extension, TTS with Suno integration
- **3D Modeling**: Image-to-3D conversion
- **Processing**: Face swap, upscaling, background removal

#### Git Tools (`src/tools/git/`)
Full Git workflow support using `simple-git` library

#### Web Tools (`src/tools/web/`)
- Brave Search API integration
- Web page content extraction

### Resource System (`src/resources/`)
Provides read-only resources like logs and prompt templates for AI generation

## Configuration Requirements

The server requires a JSON configuration file specified via `MCP_TOOLSKIT_CONFIG_PATH` environment variable containing:

- `AllowedDirectories`: Security whitelist for file operations
- `BraveSearch.ApiKey`: For web search functionality  
- `PiAPI.ApiKey`: For AI generation tools
- `PiAPI.IsFreePlan`: Affects available features and rate limits
- `Git` credentials for repository operations

## Security Model

- **Path Validation**: All file operations validated against `AllowedDirectories`
- **Tool Control**: Individual tools can be disabled via `ForbiddenTools`
- **API Security**: External API keys managed through configuration
- **No Code Execution**: Tools perform operations without executing arbitrary code

## Development Notes

- **TypeScript**: Strict typing throughout with comprehensive interfaces
- **Error Handling**: Structured error handling with context logging
- **Extensibility**: Easy to add new tools following existing patterns
- **Resource Management**: Automatic file opening and directory management for generated content