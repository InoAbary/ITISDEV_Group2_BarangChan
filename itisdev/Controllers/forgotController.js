

const API_URL = 'https://unlifted-kenneth-unmolested.ngrok-free.dev' //REPLACE WITH UR LINK!!!! !!IMPORANT!!
let userEmail = ''; // Store email for later steps

async function requestReset() {
    const email = document.getElementById('email').value;
    
    if (!email) {
        alert('Please enter your email');
        return;
    }
    
    userEmail = email; // Save for later
    
    try {
        const response = await fetch(`${API_URL}/Concessionaire-forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        if (response.ok) {
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            alert('Reset code sent to your email!');
        } else {
            const error = await response.text();
            alert(error || 'Failed to send reset code');
        }
    } catch (err) {
        console.error('Error:', err);
        alert('Network error. Please try again.');
    }
}

async function verifyCode() {
    const code = document.getElementById('code').value;
    
    if (!code) {
        alert('Please enter the verification code');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/Concessionaire-verify-reset-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important for sessions
            body: JSON.stringify({ 
                email: userEmail,
                code: code 
            })
        });
        
        if (response.ok) {
            document.getElementById('step2').style.display = 'none';
            document.getElementById('step3').style.display = 'block';
            alert('Code verified! Now set your new password.');
        } else {
            const error = await response.text();
            alert(error || 'Invalid or expired code');
        }
    } catch (err) {
        console.error('Error:', err);
        alert('Network error. Please try again.');
    }
}

async function resetPassword() {
    const newPassword = document.getElementById('new-password').value;
    
    if (!newPassword) {
        alert('Please enter a new password');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/Concessionaire-reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important for sessions
            body: JSON.stringify({ newPassword })
        });
        
        if (response.ok) {
            alert('Password reset successful! Redirecting to login...');
            setTimeout(() => {
                window.location.href = 'welcome.html';
            }, 2000);
        } else {
            const error = await response.text();
            alert(error || 'Failed to reset password');
        }
    } catch (err) {
        console.error('Error:', err);
        alert('Network error. Please try again.');
    }
}