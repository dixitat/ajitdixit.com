<?php
session_start();

// Generate CSRF token if not exists
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Generate CAPTCHA if not exists
if (empty($_SESSION['captcha_answer'])) {
    $num1 = rand(1, 10);
    $num2 = rand(1, 10);
    $_SESSION['captcha_answer'] = $num1 + $num2;
    $_SESSION['captcha_question'] = "$num1 + $num2 = ?";
}

function sanitizeInput($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}

function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

function validatePhone($phone) {
    return preg_match('/^[0-9]{10,}$/', preg_replace('/[^0-9]/', '', $phone));
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Verify CSRF token
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        die("Security error: Invalid CSRF token");
    }

    // Verify CAPTCHA
    if (!isset($_POST['captcha']) || (int)$_POST['captcha'] !== $_SESSION['captcha_answer']) {
        die("Security error: Invalid CAPTCHA answer");
    }

    // Collect and validate form data
    $errors = [];
    
    $name = sanitizeInput($_POST['name']);
    if (empty($name) || strlen($name) < 2) {
        $errors[] = "Valid name is required";
    }

    $email = sanitizeInput($_POST['email']);
    if (!validateEmail($email)) {
        $errors[] = "Valid email is required";
    }

    $phone = sanitizeInput($_POST['phone']);
    if (!validatePhone($phone)) {
        $errors[] = "Valid phone number is required (minimum 10 digits)";
    }

    $address = sanitizeInput($_POST['address']);
    if (empty($address) || strlen($address) < 10) {
        $errors[] = "Valid shipping address is required";
    }

    $order = sanitizeInput($_POST['order']);
    if (empty($order) || strlen($order) < 5) {
        $errors[] = "Order details are required";
    }

    // If there are errors, display them
    if (!empty($errors)) {
        foreach ($errors as $error) {
            echo $error . "<br>";
        }
        die();
    }

    // Email details
    $to = "ajitddixit@gmail.com";
    $subject = "New Order from $name";
    $message = "New Order Received:\n\n" .
               "Name: $name\n" .
               "Email: $email\n" .
               "Phone: $phone\n" .
               "Shipping Address: $address\n" .
               "Order Details: $order";
    $headers = "From: no-reply@yourdomain.com\r\n" .
               "Reply-To: $email\r\n" .
               "X-Mailer: PHP/" . phpversion() .
               "Content-Type: text/plain; charset=UTF-8\r\n";

    // Send email
    if (mail($to, $subject, $message, $headers)) {
        // Reset CAPTCHA and CSRF token
        unset($_SESSION['captcha_answer']);
        unset($_SESSION['captcha_question']);
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        
        echo "Order submitted successfully! We'll contact you soon.";
    } else {
        echo "There was an error processing your order. Please try again.";
    }
} else {
    echo "Invalid request method.";
}
?>