document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reportForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Report submitted successfully!');
        form.reset();
        showStep(1);
    });
});

function showStep(step) {
    const steps = document.querySelectorAll('.form-step');
    steps.forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');

    const progressSteps = document.querySelectorAll('.progress-step');
    const progressBarLine = document.getElementById('progressBarLine');
    
    progressSteps.forEach((ps, index) => {
        if (index < step) {
            ps.classList.add('active');
        } else {
            ps.classList.remove('active');
        }
    });

    const progressPercentage = ((step - 1) / (progressSteps.length - 1)) * 100;
    progressBarLine.style.width = `${progressPercentage}%`;
}

function nextStep(step) {
    showStep(step);
}

function prevStep(step) {
    showStep(step);
}

showStep(1);