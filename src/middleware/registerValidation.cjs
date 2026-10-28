const {
    validateUsername,
    validateEmail,
    validatePassword,
    validateConfirmPassword,
} = require("./validateAuth.cjs");


// ==========================================
// REGISTER VALIDATION
// ==========================================

const registerValidation = (req, res, next) => {
    const {
        username,
        email,
        password,
        confirmPassword,
    } = req.body;

    // ------------------------------------------
    // USERNAME
    // ------------------------------------------

    const usernameError = validateUsername(username);

    if (usernameError) {
        return res.status(400).json({
            success: false,
            message: usernameError,
        });
    }

    // ------------------------------------------
    // EMAIL
    // ------------------------------------------

    const emailError = validateEmail(email);

    if (emailError) {
        return res.status(400).json({
            success: false,
            message: emailError,
        });
    }

    // ------------------------------------------
    // PASSWORD
    // ------------------------------------------

    const passwordError = validatePassword(password);

    if (passwordError) {
        return res.status(400).json({
            success: false,
            message: passwordError,
        });
    }

    // ------------------------------------------
    // CONFIRM PASSWORD
    // ------------------------------------------

    const confirmPasswordError =
        validateConfirmPassword(
            password,
            confirmPassword
        );

    if (confirmPasswordError) {
        return res.status(400).json({
            success: false,
            message: confirmPasswordError,
        });
    }

    // ------------------------------------------
    // ALL CHECKS PASSED
    // ------------------------------------------

    next();
};


// ==========================================
// EXPORT
// ==========================================

module.exports = registerValidation;