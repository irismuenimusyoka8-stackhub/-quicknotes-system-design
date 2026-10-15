javascript
const API_URL = 'https://jsonplaceholder.typicode.com/posts';

/**
 * Reusable async helper that executes fetch requests,
 * checks response state, and throws clear structural errors.
 */
async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    // Return both json parsing and raw status metadata for full compliance tracking
    const data = await response.json();
    return { data, status: response.status };
}

// Global DOM Cache Object
const UI = {
    loadBtn: document.getElementById('load-btn'),
    submitBtn: document.getElementById('submit-btn'),
    status: document.getElementById('status'),
    notesList: document.getElementById('notes-list'),
    titleInput: document.getElementById('title-input'),
    bodyInput: document.getElementById('body-input'),
    form: document.getElementById('note-form')
};

/**
 * Updates interactive elements, text notifications, and structural classes.
 */
function updateUIState(isLoading, statusText, statusClass = '') {
    UI.loadBtn.disabled = isLoading;
    UI.submitBtn.disabled = isLoading;
    
    // Always bind status messaging with textContent to securely avoid XSS injection exploits
    UI.status.textContent = statusText;
    UI.status.className = statusClass;
}

/**
 * Task 1 - Load 10 Notes from Target Server (GET)
 */
async function loadNotes() {
    updateUIState(true, 'Loading notes...', 'loading');
    try {
        const { data } = await request(`${API_URL}?_limit=10`);
        UI.notesList.innerHTML = ''; // Safely clear collection container

        if (!data || data.length === 0) {
            updateUIState(false, 'No notes found.', 'empty');
            const emptyLi = document.createElement('li');
            emptyLi.className = 'empty-state';
            emptyLi.textContent = 'Your note collection is currently empty.';
            UI.notesList.appendChild(emptyLi);
            return;
        }

        data.forEach(note => {
            appendNoteToDOM(note, false);
        });

        updateUIState(false, 'Loaded 10 notes from the server.', 'success');
    } catch (error) {
        updateUIState(false, `Failed to load notes: ${error.message}`, 'error');
    }
}

/**
 * Task 2 - Create Note Submission Flow (POST)
 */
async function createNote(event) {
    event.preventDefault();
    
    const title = UI.titleInput.value.trim();
    const body = UI.bodyInput.value.trim();

    // Comprehensive Client Validation Checks
    if (!title) {
        updateUIState(false, 'Validation Error: A title is required!', 'error');
        return;
    }
    if (title.length > 100) {
        updateUIState(false, 'Validation Error: Title cannot exceed 100 characters!', 'error');
        return;
    }

    updateUIState(true, 'Creating note...', 'loading');

    try {
        const { data, status } = await request(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ title, body, userId: 1 })
        });

        // Prepend created data node to top of active list per instruction guidelines
        appendNoteToDOM(data, true);

        // Reset inputs completely
        UI.form.reset();
        
        updateUIState(false, `Note created (status ${status}, id ${data.id}).`, 'success');
    } catch (error) {
        updateUIState(false, `Failed to create note: ${error.message}`, 'error');
    }
}

/**
 * Task 3 - Delete Action Flow (DELETE)
 */
async function deleteNote(id, noteElement) {
    updateUIState(true, 'Deleting note...', 'loading');
    try {
        await request(`${API_URL}/${id}`, { method: 'DELETE' });
        
        // Remove structural element node from runtime DOM map tree directly
        noteElement.remove();
        
        updateUIState(false, 'Note successfully deleted.', 'success');
        
        // Verify empty state fallback criteria matches post removal step
        if (UI.notesList.children.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.className = 'empty-state';
            emptyLi.textContent = 'Your note collection is currently empty.';
            UI.notesList.appendChild(emptyLi);
        }
    } catch (error) {
        updateUIState(false, `Failed to delete note: ${error.message}`, 'error');
    }
}

/**
 * Structural Component Element Builder
 * Enforces textContent mapping configurations to systematically eliminate dynamic XSS vulnerabilities
 */
function appendNoteToDOM(note, prepend = false) {
    // Remove any existing placeholder empty states if present before appending
    const emptyPlaceholder = UI.notesList.querySelector('.empty-state');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const li = document.createElement('li');
    li.className = 'note-card';
    
    // Track runtime references.
    // JSONPlaceholder mocks return an id of 101 for every created record.
    // We attach a data attribute to uniquely target elements during runtime deletion experiments.
    li.setAttribute('data-id', note.id);

    const titleEl = document.createElement('h3');
    titleEl.textContent = note.title;

    const bodyEl = document.createElement('p');
    bodyEl.textContent = note.body || 'No description body provided.';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    
    deleteBtn.addEventListener('click', () => {
        /* 
          CRITICAL APPROACH COMMENT:
          JSONPlaceholder is a mock online REST API engine. The server simulates responses 
          but does not alter internal state arrays. If a user tries deleting a newly generated 
          mock note (ID 101) right after a POST, repeated network requests remain secure 
          since the server returns 200/204 blindly for any numeric paths under /posts/.
          We pass the targeted card element reference into the worker routine to update the UI correctly.
        */
        deleteNote(note.id, li);
    });

    li.appendChild(titleEl);
    li.appendChild(bodyEl);
    li.appendChild(deleteBtn);

    if (prepend) {
        UI.notesList.insertBefore(li, UI.notesList.firstChild);
    } else {
        UI.notesList.appendChild(li);
    }
}

// Runtime Component Event Listeners
UI.loadBtn.addEventListener('click', loadNotes);
UI.form.addEventListener('submit', createNote);