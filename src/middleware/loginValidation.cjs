// ==========================================
// LOGIN VALIDATION
// ==========================================

const loginValidation = (req, res, next) => {
    const {
        username,
        password,
    } = req.body;

    // ------------------------------------------
    // USERNAME / EMAIL
    // ------------------------------------------

    if (!username) {
        return res.status(400).json({
            success: false,
            message: "Username-ը կամ Email-ը պարտադիր է",
        });
    }

    const cleanUsername = username.trim();

    if (!cleanUsername) {
        return res.status(400).json({
            success: false,
            message: "Username-ը կամ Email-ը պարտադիր է",
        });
    }

    // ------------------------------------------
    // PASSWORD
    // ------------------------------------------

    if (!password) {
        return res.status(400).json({
            success: false,
            message: "Գաղտնաբառը պարտադիր է",
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

module.exports = loginValidation;