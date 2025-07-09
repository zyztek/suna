from typing import Optional, Literal
from agentpress.tool import ToolResult, openapi_schema, xml_schema
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
import httpx
from io import BytesIO
import uuid
from openai import AsyncOpenAI
import base64
import struct


class SandboxImageEditTool(SandboxToolsBase):
    """Tool for generating or editing images using OpenAI GPT Image 1 via OpenAI SDK."""

    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self.thread_manager = thread_manager
        self.client = AsyncOpenAI()

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "image_edit_or_generate",
                "description": "Generate a new image from a prompt, or edit an existing image using OpenAI GPT Image 1 via OpenAI SDK. Stores the result in the thread context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "enum": ["generate", "edit"],
                            "description": "'generate' to create a new image from a prompt, 'edit' to edit an existing image.",
                        },
                        "prompt": {
                            "type": "string",
                            "description": "Text prompt describing the desired image or edit.",
                        },
                        "image_path": {
                            "type": "string",
                            "description": "(edit mode only) Path to the image file to edit, relative to /workspace. Required for 'edit'.",
                        },
                    },
                    "required": ["mode", "prompt"],
                },
            },
        }
    )
    @xml_schema(
        tag_name="image-edit-or-generate",
        mappings=[
            {"param_name": "mode", "node_type": "attribute", "path": "."},
            {"param_name": "prompt", "node_type": "attribute", "path": "."},
            {"param_name": "image_path", "node_type": "attribute", "path": "."},
        ],
        example="""
        <function_calls>
        <invoke name="image_edit_or_generate">
        <parameter name="mode">generate</parameter>
        <parameter name="prompt">A futuristic cityscape at sunset</parameter>
        </invoke>
        </function_calls>
        """,
    )
    async def image_edit_or_generate(
        self,
        mode: str,
        prompt: str,
        image_path: Optional[str] = None,
    ) -> ToolResult:
        """Generate or edit images using OpenAI GPT Image 1 via OpenAI SDK."""
        try:
            await self._ensure_sandbox()

            if mode == "generate":
                response = await self.client.images.generate(
                    model="gpt-image-1",
                    prompt=prompt,
                    n=1,
                    size="auto",  # type: ignore
                    quality="auto",  # type: ignore
                )
            elif mode == "edit":
                if not image_path:
                    return self.fail_response("'image_path' is required for edit mode.")

                image_bytes = await self._get_image_bytes(image_path)
                if isinstance(image_bytes, ToolResult):  # Error occurred
                    return image_bytes

                # Validate image bytes
                if not image_bytes or len(image_bytes) == 0:
                    return self.fail_response("Image file is empty or could not be read.")

                # Check if it's a valid PNG file (basic check)
                if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                    return self.fail_response("Image file must be a valid PNG file. Please ensure the image is in PNG format.")
                
                # Check image size constraints (OpenAI requires square images and < 4MB)
                if len(image_bytes) > 4 * 1024 * 1024:  # 4MB limit
                    return self.fail_response("Image file must be less than 4MB in size.")
                
                # Check if image is square (required by OpenAI for editing)
                try:
                    # Read PNG header to get dimensions
                    if len(image_bytes) >= 24:
                        width, height = struct.unpack('>II', image_bytes[16:24])
                        if width != height:
                            return self.fail_response(f"Image must be square for editing. Current dimensions: {width}x{height}. Please resize the image to be square.")
                except:
                    return self.fail_response("Could not read image dimensions. Please ensure the image is a valid PNG file.")

                # Create BytesIO object for OpenAI SDK
                image_io = BytesIO(image_bytes)
                image_io.seek(0)
                # Set name attribute for proper file handling
                image_io.name = "image.png"

                response = await self.client.images.edit(
                    model="gpt-image-1",
                    image=image_io,
                    prompt=prompt,
                    n=1,
                    size="auto",  # type: ignore
                    quality="auto",  # type: ignore
                )
            else:
                return self.fail_response("Invalid mode. Use 'generate' or 'edit'.")

            # Process and save the generated image to sandbox
            image_filename = await self._process_image_response(response)
            if isinstance(image_filename, ToolResult):  # Error occurred
                return image_filename

            return self.success_response(
                f"Successfully generated image using mode '{mode}'. Image saved as: {image_filename}. You can use the ask tool to display the image. You can switch to 'edit' mode to edit this same image."
            )

        except Exception as e:
            return self.fail_response(
                f"An error occurred during image generation/editing: {str(e)}"
            )

    async def _get_image_bytes(self, image_path: str) -> bytes | ToolResult:
        """Get image bytes from URL or local file path."""
        if image_path.startswith(("http://", "https://")):
            return await self._download_image_from_url(image_path)
        else:
            return await self._read_image_from_sandbox(image_path)

    async def _download_image_from_url(self, url: str) -> bytes | ToolResult:
        """Download image from URL."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.content
        except Exception:
            return self.fail_response(f"Could not download image from URL: {url}")

    async def _read_image_from_sandbox(self, image_path: str) -> bytes | ToolResult:
        """Read image from sandbox filesystem."""
        try:
            cleaned_path = self.clean_path(image_path)
            full_path = f"{self.workspace_path}/{cleaned_path}"

            # Check if file exists and is not a directory
            file_info = await self.sandbox.fs.get_file_info(full_path)
            if file_info.is_dir:
                return self.fail_response(
                    f"Path '{cleaned_path}' is a directory, not an image file."
                )

            return await self.sandbox.fs.download_file(full_path)

        except Exception as e:
            return self.fail_response(
                f"Could not read image file from sandbox: {image_path} - {str(e)}"
            )

    async def _process_image_response(self, response) -> str | ToolResult:
        """Process OpenAI image response and save to sandbox with random name."""
        try:
            # OpenAI SDK response handling
            # The response contains either b64_json or url in data[0]
            if hasattr(response.data[0], 'b64_json') and response.data[0].b64_json:
                # Base64 response
                image_base64 = response.data[0].b64_json
                image_data = base64.b64decode(image_base64)
            elif hasattr(response.data[0], 'url') and response.data[0].url:
                # URL response - download the image
                async with httpx.AsyncClient() as client:
                    img_response = await client.get(response.data[0].url)
                    img_response.raise_for_status()
                    image_data = img_response.content
            else:
                return self.fail_response("No valid image data found in response")

            # Generate random filename
            random_filename = f"generated_image_{uuid.uuid4().hex[:8]}.png"
            sandbox_path = f"{self.workspace_path}/{random_filename}"

            # Save image to sandbox
            await self.sandbox.fs.upload_file(image_data, sandbox_path)
            return random_filename

        except Exception as e:
            return self.fail_response(f"Failed to process and save image: {str(e)}")
