// ============================================================================
// ------------------- Error Handling Examples -------------------
// Examples of how to use the unified error handling system
// ============================================================================

const { 
    handleInteractionError, 
    handleAsyncError, 
    safeAsync, 
    ERROR_RESPONSE_TYPES 
} = require('./globalErrorHandler');

// ------------------- Example 1: Interaction Error Handling -------------------
async function exampleInteractionHandler(interaction) {
    try {
        // Your interaction logic here
        const result = await someAsyncOperation();
        await interaction.reply({ content: 'Success!', ephemeral: true });
    } catch (error) {
        // Use unified error handler
        await handleInteractionError(error, interaction, {
            source: 'exampleInteractionHandler',
            commandName: 'example',
            responseType: ERROR_RESPONSE_TYPES.INTERACTION_REPLY,
            errorMessage: '❌ **Something went wrong with the example command!**'
        });
    }
}

// ------------------- Example 2: Async Function Error Handling -------------------
async function exampleAsyncFunction(data) {
    try {
        // Your async logic here
        const result = await someAsyncOperation(data);
        return { success: true, data: result };
    } catch (error) {
        // Use unified error handler
        return await handleAsyncError(error, 'exampleAsyncFunction', {
            responseType: ERROR_RESPONSE_TYPES.RETURN_ERROR,
            data: data
        });
    }
}

// ------------------- Example 3: Safe Async Wrapper -------------------
const safeExampleFunction = safeAsync(async (param1, param2) => {
    // Your function logic here
    const result = await someAsyncOperation(param1, param2);
    return { success: true, data: result };
}, {
    source: 'safeExampleFunction',
    responseType: ERROR_RESPONSE_TYPES.RETURN_ERROR
});

// ------------------- Example 4: Different Response Types -------------------
async function exampleWithDifferentResponses(interaction) {
    try {
        // Your logic here
    } catch (error) {
        // Console only - no user response
        await handleInteractionError(error, interaction, {
            responseType: ERROR_RESPONSE_TYPES.CONSOLE_ONLY
        });
        
        // Or return error object
        return await handleInteractionError(error, interaction, {
            responseType: ERROR_RESPONSE_TYPES.RETURN_ERROR
        });
        
        // Or throw error
        await handleInteractionError(error, interaction, {
            responseType: ERROR_RESPONSE_TYPES.THROW_ERROR
        });
    }
}

module.exports = {
    exampleInteractionHandler,
    exampleAsyncFunction,
    safeExampleFunction,
    exampleWithDifferentResponses
};
