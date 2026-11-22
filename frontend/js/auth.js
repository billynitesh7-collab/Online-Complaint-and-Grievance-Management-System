/**
 * Authentication Client Logic (Login & Registration)
 * Online Complaint and Grievance Management System
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Password Visibility Toggle
  document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  });

  // 2. Handle Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    // Check URL parameters for feedback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registered') === 'true') {
      api.showAlert('alertContainer', 'Registration successful! Please log in with your credentials.', 'success');
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      api.clearAlert('alertContainer');

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        api.showAlert('alertContainer', 'Please enter both email and password.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        const response = await api.post('/auth/login', { email, password });
        const user = response.data?.user;

        if (user) {
          // Check for redirect URL
          const redirect = urlParams.get('redirect');
          if (redirect) {
            window.location.href = decodeURIComponent(redirect);
            return;
          }

          if (user.role === 'admin') {
            window.location.href = '/admin/dashboard.html';
          } else {
            window.location.href = '/student/dashboard.html';
          }
        }
      } catch (err) {
        api.showAlert('alertContainer', err.message || 'Login failed. Please check your credentials.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
      }
    });
  }

  // 3. Handle Student Registration Form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      api.clearAlert('alertContainer');

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const rollNumber = document.getElementById('rollNumber').value.trim();
      const department = document.getElementById('department').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      // Validation
      if (!name || !email || !rollNumber || !department || !password) {
        api.showAlert('alertContainer', 'All fields are required.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        api.showAlert('alertContainer', 'Please enter a valid email address.');
        return;
      }

      if (password.length < 6) {
        api.showAlert('alertContainer', 'Password must be at least 6 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        api.showAlert('alertContainer', 'Passwords do not match.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering account...';

      try {
        await api.post('/auth/register', {
          name,
          email,
          rollNumber,
          department,
          password,
        });

        window.location.href = '/login.html?registered=true';
      } catch (err) {
        api.showAlert('alertContainer', err.message || 'Registration failed.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register Account';
      }
    });
  }
});
