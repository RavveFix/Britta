import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import './styles/main.css';
import './styles/components/vat-card.css';
import './styles/components/voice-input.css';
import type { VATReportResponse } from './types/vat';
import { ExcelWorkspace } from './components/ExcelWorkspace';
import { VoiceService } from './utils/VoiceService';

// Initialize Supabase client
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('main.ts module loading...');

// Define interfaces
interface Company {
    id: string;
    name: string;
    orgNumber: string;
    address: string;
    phone: string;
    history: any[];
    invoices: any[];
    documents: any[];
    verificationCounter: number;
    conversationId?: string; // Changed from chatHistory to conversationId
}



async function initApp() {
    // Initialize Excel Workspace
    const excelWorkspace = new ExcelWorkspace({
        onClose: () => {
            console.log('Excel panel closed');
        },
        onSheetChange: (sheetName) => {
            console.log('Switched to sheet:', sheetName);
        },
        onError: (error) => {
            console.error('Excel workspace error:', error);
        }
    });

    // Check Authentication State
    const { data: { session } } = await supabase.auth.getSession();

    // Handle login page redirect if not authenticated and not on login/landing page
    const isLoginPage = window.location.pathname.includes('login.html');
    const isLandingPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');

    if (!session && !isLoginPage && !isLandingPage && window.location.pathname.includes('/app/')) {
        window.location.href = '/login.html';
        return;
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);

        if (event === 'SIGNED_IN' && session) {
            // Load conversation when user signs in
            const currentCompany = getCurrentCompany();
            if (currentCompany) {
                console.log('User signed in, loading conversation for company:', currentCompany.id);
                loadConversationFromDB(currentCompany.id).catch((error: unknown) => {
                    console.error('Failed to load conversation on sign in:', error);
                });
            }
        } else if (event === 'SIGNED_OUT') {
            // Clear chat on sign out
            if (chatContainer) chatContainer.innerHTML = '';
            window.location.href = '/login.html';
        }
    });

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    const moonIcon = document.querySelector('.moon-icon') as HTMLElement;
    const sunIcon = document.querySelector('.sun-icon') as HTMLElement;
    const savedTheme = localStorage.getItem('theme') || 'dark';

    // Apply saved theme
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (moonIcon && sunIcon) updateThemeIcon(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme: string) {
        if (!moonIcon || !sunIcon) return;
        if (theme === 'light') {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        } else {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        }
    }

    // Company Management
    let companies: Company[] = JSON.parse(localStorage.getItem('companies') || '[]');
    let currentCompanyId = localStorage.getItem('currentCompanyId') || null;

    // Initialize companies if none exist
    if (companies.length === 0) {
        const defaultCompany: Company = {
            id: 'company-' + Date.now(),
            name: 'Mitt Företag AB',
            orgNumber: '',
            address: '',
            phone: '',
            history: [],
            invoices: [],
            documents: [],
            verificationCounter: 1
        };
        companies = [defaultCompany];
        currentCompanyId = defaultCompany.id;
        localStorage.setItem('companies', JSON.stringify(companies));
        localStorage.setItem('currentCompanyId', currentCompanyId!);
    }

    // Get current company
    function getCurrentCompany(): Company {
        return companies.find(c => c.id === currentCompanyId) || companies[0];
    }

    // Save companies to localStorage
    function saveCompanies() {
        localStorage.setItem('companies', JSON.stringify(companies));
    }

    // Switch company
    async function switchCompany(companyId: string) {
        currentCompanyId = companyId;
        localStorage.setItem('currentCompanyId', companyId);

        // Reload all data for new company
        const company = getCurrentCompany();

        // Refresh views
        // renderHistory();
        // renderInvoices();
        // renderDocuments();

        // Load chat history from database for new company
        await loadConversationFromDB(company.id);
    }

    // Load conversation from database
    async function loadConversationFromDB(companyId: string) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.log('No session, clearing chat');
                if (chatContainer) chatContainer.innerHTML = '';
                return;
            }

            const currentCompany = getCurrentCompany();

            // Get or create conversation for this company
            const { data: conversationId, error: rpcError } = await supabase.rpc('get_or_create_conversation', {
                p_user_id: session.user.id,
                p_company_id: companyId
            });

            if (rpcError) {
                console.error('Error getting conversation:', rpcError);
                return;
            }

            // Store conversationId in company data
            currentCompany.conversationId = conversationId;
            saveCompanies();

            // Load messages from database
            const { data: messages, error: messagesError } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (messagesError) {
                console.error('Error loading messages:', messagesError);
                return;
            }

            // Clear and reload chat UI
            loadChatHistoryFromMessages(messages || []);
        } catch (error) {
            console.error('Error loading conversation from DB:', error);
        }
    }

    // Load chat from database messages
    function loadChatHistoryFromMessages(messages: any[]) {
        if (!chatContainer) return;

        // Clear chat
        chatContainer.innerHTML = '';

        // Add welcome message
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'message ai-message welcome-message';
        welcomeMsg.innerHTML = `
            <div class="avatar">B</div>
            <div class="bubble">
                <p>Hej! Jag är <strong>Britta</strong>, din expert på svensk bokföring.</p>
                <p>Jag kan hjälpa dig med kontering, momsregler, avdrag och bokslut. Vad funderar du på idag?</p>
            </div>
        `;
        chatContainer.appendChild(welcomeMsg);

        // Load saved messages
        messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`;

            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.textContent = msg.role === 'user' ? 'Du' : 'B';

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = markdownToHtml(msg.content);

            messageDiv.appendChild(avatar);
            messageDiv.appendChild(bubble);
            chatContainer.appendChild(messageDiv);
        });

        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }





    // Get recent chat history from database for API context (last N messages)
    async function getRecentChatHistory(conversationId: string, maxMessages: number = 20): Promise<Array<{ role: string, content: string }>> {
        try {
            // Query messages from database
            const { data: messages, error } = await supabase
                .from('messages')
                .select('role, content')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(maxMessages);

            if (error) {
                console.error('Error fetching history for context:', error);
                return [];
            }

            // Reverse to get chronological order (oldest to newest)
            const chronologicalMessages = (messages || []).reverse();

            // Format for Gemini API
            return chronologicalMessages.map((msg: { role: string, content: string }) => ({
                role: msg.role === 'user' ? 'user' : 'model',
                content: msg.content
            }));
        } catch (error) {
            console.error('Error in getRecentChatHistory:', error);
            return [];
        }
    }



    // Create new company
    function createNewCompany() {
        const modal = document.getElementById('company-modal');
        const form = document.getElementById('company-form') as HTMLFormElement;

        if (!modal || !form) return;

        // Show modal
        modal.classList.remove('hidden');

        // Clear form
        form.reset();

        // Focus first field
        const nameInput = document.getElementById('company-name');
        if (nameInput) nameInput.focus();
    }

    // Modal event listeners
    const companyModal = document.getElementById('company-modal');
    const companyForm = document.getElementById('company-form') as HTMLFormElement;
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');

    // Close modal handlers
    function closeModal() {
        if (companyModal) companyModal.classList.add('hidden');
        if (companyForm) companyForm.reset();
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

    // Click outside modal to close
    if (companyModal) {
        companyModal.addEventListener('click', (e) => {
            if (e.target === companyModal) {
                closeModal();
            }
        });
    }

    // Handle form submission
    if (companyForm) {
        companyForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const companyName = (document.getElementById('company-name') as HTMLInputElement).value.trim();
            const orgNumber = (document.getElementById('org-number') as HTMLInputElement).value.trim();
            const address = (document.getElementById('company-address') as HTMLInputElement).value.trim();
            const phone = (document.getElementById('company-phone') as HTMLInputElement).value.trim();

            if (!companyName) {
                alert('Företagsnamn är obligatoriskt');
                return;
            }

            const newCompany: Company = {
                id: 'company-' + Date.now(),
                name: companyName,
                orgNumber: orgNumber || '',
                address: address || '',
                phone: phone || '',
                history: [],
                invoices: [],
                documents: [],
                verificationCounter: 1
            };

            companies.push(newCompany);
            saveCompanies();
            renderCompanySelector();
            switchCompany(newCompany.id);
            closeModal();
        });
    }

    // Render company selector
    function renderCompanySelector() {
        const companySelect = document.getElementById('company-select') as HTMLSelectElement;
        if (!companySelect) return;

        companySelect.innerHTML = '';

        companies.forEach(company => {
            const option = document.createElement('option');
            option.value = company.id;
            option.textContent = company.name;
            option.selected = company.id === currentCompanyId;
            companySelect.appendChild(option);
        });
    }

    // Company selector event listeners
    const companySelect = document.getElementById('company-select') as HTMLSelectElement;
    const addCompanyBtn = document.getElementById('add-company-btn');

    if (companySelect) {
        companySelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            switchCompany(target.value);
        });
    }

    if (addCompanyBtn) {
        addCompanyBtn.addEventListener('click', () => {
            createNewCompany();
        });
    }

    // Mock Connect Fortnox Logic
    const connectBtn = document.getElementById('connect-fortnox-btn') as HTMLButtonElement;
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            // Simulate connection flow
            connectBtn.innerHTML = '<span>Ansluter...</span>';
            connectBtn.style.opacity = '0.7';
            connectBtn.disabled = true;

            setTimeout(() => {
                alert('🔗 Du skickas nu till Fortnox för att godkänna kopplingen...\n\n(Detta är en simulation)');

                setTimeout(() => {
                    connectBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 6L9 17l-5-5"></path>
                        </svg>
                        <span>Kopplad</span>
                    `;
                    connectBtn.classList.add('connected');
                    connectBtn.style.opacity = '1';
                    connectBtn.disabled = false;

                    addMessage('✅ <strong>Fortnox kopplat!</strong><br>Jag har nu tillgång till dina kunder och artiklar.', 'ai');
                }, 1000);
            }, 1000);
        });
    }

    // Initialize company selector
    renderCompanySelector();

    // Load conversation from database for current company
    const currentCompany = getCurrentCompany();
    if (currentCompany) {
        loadConversationFromDB(currentCompany.id).catch((error: unknown) => {
            console.error('Failed to load initial conversation:', error);
        });
    }

    // Chat initialization
    const chatForm = document.getElementById('chat-form') as HTMLFormElement;
    const userInput = document.getElementById('user-input') as HTMLInputElement;
    const chatContainer = document.getElementById('chat-container');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const attachBtn = document.getElementById('attach-btn');
    const filePreview = document.getElementById('file-preview');
    const fileNameSpan = filePreview?.querySelector('.file-name');
    const removeFileBtn = filePreview?.querySelector('.remove-file');

    let currentFile: File | null = null;

    // Auto-focus input
    if (userInput) userInput.focus();

    // File Attachment Logic
    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                currentFile = target.files[0];
                showFilePreview(currentFile.name);
            }
        });
    }

    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', () => {
            clearFile();
        });
    }

    function showFilePreview(name: string) {
        if (fileNameSpan) fileNameSpan.textContent = name;
        if (filePreview) filePreview.classList.remove('hidden');
        if (userInput) userInput.focus();
    }

    function clearFile() {
        currentFile = null;
        if (fileInput) fileInput.value = '';
        if (filePreview) filePreview.classList.add('hidden');
        if (userInput) userInput.focus();
    }

    // Voice Logic
    const micBtn = document.getElementById('mic-btn');
    const voiceRecordingUI = document.getElementById('voice-recording-ui');
    const textInputContainer = document.querySelector('.text-input-container');
    const voiceCancelBtn = document.getElementById('voice-cancel-btn');
    const voiceConfirmBtn = document.getElementById('voice-confirm-btn');
    const waveformBars = document.querySelectorAll('.waveform-bar');

    if (micBtn) {
        const voiceService = new VoiceService();

        if (voiceService.isSupported()) {
            micBtn.addEventListener('click', () => {
                voiceService.toggle();
            });


            voiceService.onStateChange((isListening) => {
                if (isListening) {
                    // Show waveform UI
                    if (voiceRecordingUI) voiceRecordingUI.classList.remove('hidden');
                    if (textInputContainer) textInputContainer.classList.add('recording');
                    micBtn.classList.add('listening');
                    micBtn.style.display = 'none'; // Hide mic button during recording
                } else {
                    // Hide waveform UI
                    if (voiceRecordingUI) voiceRecordingUI.classList.add('hidden');
                    if (textInputContainer) textInputContainer.classList.remove('recording');
                    micBtn.classList.remove('listening');
                    micBtn.style.display = ''; // Show mic button again

                    // Reset bars to minimum height
                    waveformBars.forEach((bar) => {
                        (bar as HTMLElement).style.height = '8px';
                    });
                }
            });

            // Animate waveform bars based on audio level
            voiceService.onAudioLevel((level) => {
                waveformBars.forEach((bar) => {
                    const minHeight = 8;
                    const maxHeight = 32;

                    // Add some randomness for more natural look
                    const randomFactor = 0.7 + Math.random() * 0.6;
                    const height = minHeight + (level * randomFactor * (maxHeight - minHeight));

                    (bar as HTMLElement).style.height = `${height}px`;
                });
            });

            voiceService.onResult((text) => {
                if (userInput) {
                    userInput.value = text;
                }
            });

            // Cancel button - discard recording
            if (voiceCancelBtn) {
                voiceCancelBtn.addEventListener('click', () => {
                    voiceService.cancel();
                    if (userInput) {
                        userInput.value = '';
                        userInput.focus();
                    }
                });
            }

            // Confirm button - stop recording and keep text
            if (voiceConfirmBtn) {
                voiceConfirmBtn.addEventListener('click', () => {
                    voiceService.stop();
                    // Focus input so user can review and manually send
                    if (userInput) {
                        userInput.focus();
                    }
                });
            }
        } else {
            micBtn.style.display = 'none';
        }
    }



    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let message = userInput.value.trim();

            if (!message && !currentFile) return;

            // If no message but file is attached, use a default message
            if (!message && currentFile) {
                message = "Analysera denna fil";
            }

            const fileToSend = currentFile;
            let fileUrl: string | null = null;
            let vatReportResponse: VATReportResponse | null = null;

            // Upload Excel files to Supabase Storage
            if (fileToSend && (fileToSend.name.endsWith('.xlsx') || fileToSend.name.endsWith('.xls'))) {
                try {
                    // Upload for Excel viewer
                    fileUrl = await uploadFileToSupabase(fileToSend);

                    // Analyze with Claude for Swedish VAT report
                    vatReportResponse = await analyzeExcelWithClaude(fileToSend);

                    // Store report in localStorage
                    localStorage.setItem('latest_vat_report', JSON.stringify({
                        ...vatReportResponse,
                        fileUrl,
                        filename: fileToSend.name,
                        analyzedAt: new Date().toISOString()
                    }));

                } catch (error) {
                    console.error('Failed to process Excel file:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
                    addMessage(`⚠️ **Kunde inte analysera Excel-filen:**\n\n${errorMessage}\n\nFilen är uppladdad och kan öppnas manuellt.`, 'ai');
                }
            }

            // Add user message with optional file and URL
            addMessage(message, 'user', fileToSend, fileUrl);

            // Clear input and file
            userInput.value = '';
            clearFile();

            // Show AI response based on file type
            if (vatReportResponse && vatReportResponse.type === 'vat_report') {
                // Open VAT report in right panel (Claude artifacts style)
                excelWorkspace.openVATReport(vatReportResponse.data, fileUrl || undefined);

                // Show simple confirmation message in chat
                addMessage(`✅ **Momsredovisning skapad för ${vatReportResponse.data.period}**\n\nRapporten visas till höger. Du kan fortsätta ställa frågor samtidigt som du tittar på rapporten.`, 'ai');
            } else {
                await sendToGemini(message, fileToSend, fileUrl);
            }
        });
    }

    function markdownToHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function addMessage(text: string, sender: 'user' | 'ai', file: File | null = null, fileUrl: string | null = null) {
        if (!chatContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.textContent = sender === 'user' ? 'Du' : 'B';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('bubble');

        let content = '';

        // Add file attachment display if present
        if (file) {
            const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
            const clickableClass = (isExcel && fileUrl) ? 'file-attachment-clickable' : '';

            content += `
                <div class="${clickableClass}" data-file-url="${fileUrl || ''}" data-file-name="${file.name}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span style="font-size: 0.9em;">${file.name}</span>
                    ${isExcel && fileUrl ? '<span style="margin-left: auto; font-size: 0.75em; color: var(--accent-primary);">Klicka för att öppna →</span>' : ''}
                </div>
            `;
        }

        // Allow simple HTML in AI responses for formatting
        if (sender === 'ai') {
            const htmlContent = markdownToHtml(text);
            content += htmlContent;



        } else {
            content += text ? `<p>${text}</p>` : '';
        }

        bubbleDiv.innerHTML = content;

        // Add click handler for Excel files
        if (file && fileUrl) {
            const fileAttachment = bubbleDiv.querySelector('.file-attachment-clickable') as HTMLElement;
            if (fileAttachment) {
                fileAttachment.addEventListener('click', () => {
                    const url = fileAttachment.dataset.fileUrl;
                    const name = fileAttachment.dataset.fileName;
                    if (url && name) excelWorkspace.openExcelFile(url, name);
                });
            }
        }

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(bubbleDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }


    async function uploadFileToSupabase(file: File): Promise<string> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('User not authenticated');

            const reader = new FileReader();
            const base64Data = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const company = getCurrentCompany();

            const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    filename: file.name,
                    fileData: base64Data,
                    mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    userId: session.user.id,
                    companyId: company ? company.id : null
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const result = await response.json();
            return result.file.url;
        } catch (error) {
            console.error('File upload error:', error);
            throw error;
        }
    }

    async function analyzeExcelWithClaude(file: File): Promise<VATReportResponse> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('User not authenticated');

            addMessage('Jag analyserar din Excel-fil... Detta kan ta några sekunder. ⏳', 'ai');

            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer);

            const sheets: Record<string, any[]> = {};
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            });

            const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    filename: file.name,
                    sheets: sheets
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Analysis failed');
            }

            const result = await response.json();
            return result;  // Returns { type: 'vat_report', data: {...} }
        } catch (error) {
            console.error('Excel analysis error:', error);
            throw error;
        }
    }

    async function sendToGemini(message: string, file: File | null, fileUrl: string | null = null) {
        try {
            // Show loading state
            const loadingId = 'loading-' + Date.now();
            const loadingDiv = document.createElement('div');
            loadingDiv.id = loadingId;
            loadingDiv.className = 'message ai-message';
            loadingDiv.innerHTML = `
                <div class="avatar">B</div>
                <div class="bubble">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            `;
            chatContainer?.appendChild(loadingDiv);
            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

            // Prepare file data if present
            let fileData = null;
            if (file) {
                const base64 = await fileToBase64(file);
                // Remove data URL prefix (e.g., "data:image/png;base64,")
                const base64Data = base64.split(',')[1];
                fileData = {
                    data: base64Data,
                    mimeType: file.type
                };
            }

            // Get current company conversation ID
            const currentCompany = getCurrentCompany();
            let conversationId = currentCompany.conversationId;

            // If conversationId is missing, try to get/create it
            if (!conversationId) {
                console.log('Conversation ID missing, fetching...');
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const { data, error } = await supabase.rpc('get_or_create_conversation', {
                        p_user_id: session.user.id,
                        p_company_id: currentCompany.id
                    });

                    if (data) {
                        conversationId = data;
                        currentCompany.conversationId = conversationId;
                        saveCompanies(); // Save to localStorage
                        console.log('Fetched new conversation ID:', conversationId);
                    } else if (error) {
                        console.error('Error fetching conversation ID:', error);
                    }
                }
            }

            // Get recent chat history from database (excluding the current message we just added)
            const history = conversationId ? await getRecentChatHistory(conversationId, 20) : [];

            const { data, error } = await supabase.functions.invoke('gemini-chat', {
                body: {
                    message,
                    fileData,
                    history,
                    conversationId,
                    companyId: currentCompany.id,
                    fileUrl: fileUrl || null,
                    fileName: file?.name || null
                }
            });

            // Remove loading indicator
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();

            if (error) throw error;

            if (data) {
                if (data.type === 'text') {
                    addMessage(data.data, 'ai');
                } else if (data.type === 'json') {
                    // Handle tool output (e.g. create_invoice)
                    addMessage(`Jag har förberett en åtgärd: \n\`\`\`json\n${JSON.stringify(data.data, null, 2)}\n\`\`\``, 'ai');
                }
            }

        } catch (error) {
            console.error('Gemini error:', error);
            // Remove loading indicator if still present
            // Remove loading indicator if still present
            const loaders = document.querySelectorAll('.typing-dots');
            loaders.forEach(l => l.closest('.message')?.remove());

            addMessage('⚠️ Tyvärr uppstod ett fel vid kontakten med Britta. Försök igen senare.', 'ai');
        }
    }

    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}

// Execute initialization
console.log('main.ts module loaded, readyState:', document.readyState);
try {
    if (document.readyState !== 'complete') {
        console.log('Waiting for window.onload (readyState not complete)');
        window.addEventListener('load', () => {
            console.log('window.on load fired, calling initApp');
            initApp();
        });
    } else { // complete
        console.log('DOM already complete, calling initApp immediately');
        initApp();
    }
} catch (error) {
    console.error('Error in main.ts initialization:', error);
}
