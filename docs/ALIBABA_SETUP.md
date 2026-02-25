# Alibaba Cloud Coding Plan Setup Guide

This guide walks you through setting up Alibaba Cloud Coding Plan for use with DMux.

## Prerequisites

- Alibaba Cloud account
- Valid payment method on your Alibaba Cloud account

## Step 1: Subscribe to Coding Plan

1. Go to [Alibaba Cloud Console](https://home.console.aliyun.com/)
2. Navigate to **DashScope** (Model Studio)
3. Click on **Coding Plan** in the left sidebar
4. Click **Subscribe** or **Activate** to enable the service
5. Agree to the terms and complete the subscription process

## Step 2: Get Your API Key

1. Log in to [Alibaba Cloud Console](https://home.console.aliyun.com/)
2. Go to **DashScope Console**
3. Click on **API-KEY Management** in the left navigation
4. Click **Create New API Key**
5. Copy your API key immediately. It will look like: `sk-sp-xxxxxxxxxxxxxxxxxxxxxxxx`

> **Important:** Store your API key securely. You cannot view it again after closing the dialog.

## Step 3: Configure Environment Variables

Set the following environment variables in your shell or `.env` file:

### For bash/zsh

Add these to your `~/.bashrc`, `~/.zshrc`, or shell session:

```bash
export ALIBABA_CLOUD_API_KEY="sk-sp-your-actual-api-key-here"
export ALIBABA_CLOUD_ENDPOINT="https://coding.dashscope.aliyuncs.com/v1"
```

### For .env file (recommended for development)

Create a `.env` file in your project root:

```env
ALIBABA_CLOUD_API_KEY=sk-sp-your-actual-api-key-here
ALIBABA_CLOUD_ENDPOINT=https://coding.dashscope.aliyuncs.com/v1
```

### For Windows PowerShell

```powershell
$env:ALIBABA_CLOUD_API_KEY="sk-sp-your-actual-api-key-here"
$env:ALIBABA_CLOUD_ENDPOINT="https://coding.dashscope.aliyuncs.com/v1"
```

## Step 4: Verify Your Setup

Test your API key with a simple curl request:

```bash
curl -X POST "https://coding.dashscope.aliyuncs.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALIBABA_CLOUD_API_KEY" \
  -d '{
    "model": "qwen3.5-plus",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

If you receive a valid response, your setup is complete.

## Supported Models

The following models are available through Alibaba Cloud Coding Plan:

| Model | Description |
|-------|-------------|
| `qwen3.5-plus` | Balanced performance and capability |
| `qwen3-max-2026-01-23` | Maximum capability version |
| `qwen3-coder-next` | Next-generation coding model |
| `qwen3-coder-plus` | Enhanced coding capabilities |
| `MiniMax-M2.5` | MiniMax model integration |
| `glm-5` | GLM-5 model |
| `glm-4.7` | GLM-4.7 model |
| `kimi-k2.5` | Kimi K2.5 model |

### Example: Using Different Models

```bash
# Using qwen3-coder-plus
export ALIBABA_CLOUD_MODEL="qwen3-coder-plus"

# Using glm-5
export ALIBABA_CLOUD_MODEL="glm-5"

# Using kimi-k2.5
export ALIBABA_CLOUD_MODEL="kimi-k2.5"
```

## Troubleshooting

### Issue: "Invalid API Key" Error

**Solution:**
- Verify your API key starts with `sk-sp-`
- Ensure no extra spaces or characters in your environment variable
- Re-generate a new API key from the console if needed

### Issue: "Subscription Required" Error

**Solution:**
- Confirm you've completed the Coding Plan subscription
- Check that your Alibaba Cloud account has a valid payment method
- Wait 5-10 minutes after subscription for activation

### Issue: Rate Limit Exceeded

**Solution:**
- Check your subscription tier limits in the DashScope console
- Implement retry logic with exponential backoff
- Consider upgrading your subscription tier

### Issue: Connection Timeout

**Solution:**
- Verify network connectivity to `coding.dashscope.aliyuncs.com`
- Check firewall settings
- Try using a different network or VPN if in a restricted region

### Issue: Model Not Found

**Solution:**
- Verify the model name is spelled correctly
- Check that the model is included in your subscription tier
- Refer to the supported models table above for valid names

## Security Best Practices

1. **Never commit API keys to version control**
   - Add `.env` to your `.gitignore` file
   - Use secret management tools in production

2. **Rotate keys regularly**
   - Generate new API keys periodically
   - Revoke old keys after rotation

3. **Use environment-specific keys**
   - Separate keys for development, staging, and production
   - Limit permissions based on environment needs

4. **Monitor usage**
   - Set up billing alerts in Alibaba Cloud Console
   - Review API usage logs regularly

## Additional Resources

- [Alibaba Cloud DashScope Documentation](https://help.aliyun.com/zh/dashscope/)
- [Coding Plan Pricing](https://www.aliyun.com/price/product)
- [API Reference](https://help.aliyun.com/zh/dashscope/developer-reference/)

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [Alibaba Cloud Support Center](https://workorder.console.aliyun.com/)
2. Review community forums and documentation
3. Contact Alibaba Cloud support through your console
