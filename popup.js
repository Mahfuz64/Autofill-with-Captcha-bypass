let districtData = {};
let subjectData = {};

let appState = {
    activeProfileName: null,
    isDirty: false,
    profiles: {},
    currentPhoto: "",
    currentSig: ""
};

// --- 2. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  await loadAllData();
  refreshProfileDropdown();
  setupDynamicDropdowns();
});

async function loadAllData() {
  try {
    const [distRes, gradRes, masRes, sscRes, hscRes] = await Promise.all([
      fetch("data/districts.json"),
      fetch("data/graduation.json"),
      fetch("data/masters.json"),
      fetch("data/ssc.json"),
      fetch("data/hsc.json"),
    ]);

    districtData = await distRes.json();
    const gData = await gradRes.json();
    const mData = await masRes.json();
    const sData = await sscRes.json();
    const hData = await hscRes.json();

    subjectData = { ...gData, ...mData, ...sData, ...hData };
  } catch (err) {
    console.error("❌ Error loading data:", err);
  }
}

// --- 3. DYNAMIC DROPDOWN LOGIC ---
function setupDynamicDropdowns() {
  document
    .querySelector('[name="present_district"]')
    ?.addEventListener("change", function () {
      const districtName = this.options[this.selectedIndex].text;
      const upazilaSelect = document.querySelector('[name="present_upazila"]');
      upazilaSelect.innerHTML =
        '<option value="">-- Select Upazila --</option>';

      if (districtData[districtName]) {
        districtData[districtName].forEach((upazila) => {
          const option = document.createElement("option");
          option.value = upazila.id;
          option.textContent = upazila.name;
          upazilaSelect.appendChild(option);
        });
      }
    });

  const setupExamListener = (examName, subjectName) => {
    const examSelect = document.querySelector(`[name="${examName}"]`);
    const subSelect = document.querySelector(`[name="${subjectName}"]`);

    examSelect?.addEventListener("change", function () {
      const selectedExam = this.options[this.selectedIndex].text;
      subSelect.innerHTML = '<option value="">-- Select Subject --</option>';
      if (subjectData[selectedExam]) {
        subjectData[selectedExam].forEach((sub) => {
          const option = document.createElement("option");
          option.value = sub.id;
          option.textContent = sub.name;
          subSelect.appendChild(option);
        });
      }
    });
  };

  setupExamListener("gra_exam", "gra_subject");
  setupExamListener("mas_exam", "mas_subject");
  setupExamListener("ssc_exam", "ssc_group");
  setupExamListener("hsc_exam", "hsc_group");
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.getElementById('profilePhoto')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        appState.currentPhoto = await fileToBase64(file);
        const preview = document.getElementById('photoPreview');
        preview.src = appState.currentPhoto;
        preview.style.display = 'block';
        appState.isDirty = true;
    }
});

document.getElementById('profileSignature')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        appState.currentSig = await fileToBase64(file);
        const preview = document.getElementById('sigPreview');
        preview.src = appState.currentSig;
        preview.style.display = 'block';
        appState.isDirty = true;
    }
});

// --- 4. FORM HANDLING ---
function getFormData() {
  const formData = new FormData(document.getElementById("jsonForm"));
  const jsonObject = {};
  formData.forEach((value, key) => {
    jsonObject[key] = value;
  });
  jsonObject.same_as_present = document.querySelector(
    '[name="same_as_present"]',
  )?.checked
    ? "1"
    : "0";

  jsonObject.display_name = jsonObject.name || "";
  jsonObject.confirm_mobile = jsonObject.mobile || "";
  jsonObject.photo_base64 = appState.currentPhoto || "";
  jsonObject.signature_base64 = appState.currentSig || "";
  return jsonObject;
}

// --- 5. TAB SWITCHING ---
document
  .getElementById("tabAutofill")
  .addEventListener("click", () => switchTab("Autofill"));
document
  .getElementById("tabProfile")
  .addEventListener("click", () => switchTab("Profile"));

function switchTab(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".view")
    .forEach((view) => view.classList.remove("active-view"));
  document.getElementById(`tab${tab}`).classList.add("active");
  document.getElementById(`view${tab}`).classList.add("active-view");
}

function refreshProfileDropdown() {
  chrome.storage.local.get(["savedProfiles"], function (result) {
    appState.profiles = result.savedProfiles || {};
    const selector = document.getElementById("profileSelector");
    selector.innerHTML =
      '<option value="">-- ➕ Create New Profile --</option>';
    for (const profileName in appState.profiles) {
      const opt = document.createElement("option");
      opt.value = profileName;
      opt.textContent = profileName;
      selector.appendChild(opt);
    }
  });
}

function updatePreviewCard() {
  const previewCard = document.getElementById("previewCard");
  if (!appState.activeProfileName) {
    if (previewCard) previewCard.style.display = "none";
    return;
  }
  const profile = appState.profiles[appState.activeProfileName];
  if (document.getElementById("displayName"))
    document.getElementById("displayName").textContent =
      "👤 Name: " + (profile.name || "N/A");
  if (document.getElementById("mobileInfo"))
    document.getElementById("mobileInfo").textContent =
      "📱 Mobile: " + (profile.mobile || "N/A");
  if (document.getElementById("emailInfo"))
    document.getElementById("emailInfo").textContent =
      "📧 Email: " + (profile.email || "N/A");
  if (previewCard) previewCard.style.display = "block";
}

document
  .getElementById("profileSelector")
  .addEventListener("change", function () {
    const selectedName = this.value;
    if (
      appState.isDirty &&
      !confirm("You have unsaved changes in the editor. Discard them?")
    ) {
      this.value = appState.activeProfileName || "";
      return;
    }
    appState.activeProfileName = selectedName === "" ? null : selectedName;
    appState.isDirty = false;

    updatePreviewCard();
    populateEditorTab();
  });

function populateEditorTab() {
  const form = document.getElementById("jsonForm");
  const header = document.getElementById("editorHeader");
  const saveBtn = document.getElementById("saveBtn");
  const profileNameInput = document.getElementById("profileName");

  if (!appState.activeProfileName) {
    form.reset();
    profileNameInput.value = "";
    if (header) header.textContent = "✨ Creating New Profile";
    if (saveBtn) saveBtn.textContent = "💾 Save New Profile";
  } else {
    const data = appState.profiles[appState.activeProfileName];
    profileNameInput.value = appState.activeProfileName;
    if (header)
      header.textContent = `✏️ Editing: ${appState.activeProfileName}`;
    if (saveBtn) saveBtn.textContent = "💾 Update Profile";

    appState.currentPhoto = data ? data.photo_base64 || "" : "";
    appState.currentSig = data ? data.signature_base64 || "" : "";

    const pPreview = document.getElementById("photoPreview");
    const sPreview = document.getElementById("sigPreview");

    pPreview.src = appState.currentPhoto;
    pPreview.style.display = appState.currentPhoto ? "block" : "none";
    sPreview.src = appState.currentSig;
    sPreview.style.display = appState.currentSig ? "block" : "none";

    document.getElementById("profilePhoto").value = "";
    document.getElementById("profileSignature").value = "";

    for (const key in data) {
      const field = form.querySelector(`[name="${key}"]`);
      if (field) {
        if (field.type === "checkbox") {
          field.checked = data[key] === "1";
        } else {
          field.value = data[key];
        }
        field.dispatchEvent(new Event("change"));
      }
    }

    setTimeout(() => {
      const dynamicFields = [
        "present_upazila",
        "gra_subject",
        "mas_subject",
        "ssc_group",
        "hsc_group",
        "ssc_board",
        "hsc_board",
      ];
      dynamicFields.forEach((f) => {
        const field = form.querySelector(`[name="${f}"]`);
        if (field && data[f]) field.value = data[f];
      });
    }, 150);
  }
}

document.getElementById("jsonForm").addEventListener("input", () => {
  if (!appState.isDirty) {
    appState.isDirty = true;
    const header = document.getElementById("editorHeader");
    if (header && !header.textContent.includes("*(Unsaved)*")) {
      header.textContent += " *(Unsaved)*";
    }
  }
});

// --- 6. ACTION BUTTON LISTENERS ---
const editShortcutBtn = document.getElementById("editShortcutBtn");
if (editShortcutBtn) {
  editShortcutBtn.addEventListener("click", () => {
    if (!appState.activeProfileName)
      return alert("Select a profile to edit first.");
    switchTab("Profile");
  });
}

const startBlankBtn = document.getElementById("startBlankBtn");
if (startBlankBtn) {
  startBlankBtn.addEventListener("click", () => {
    if (appState.isDirty && !confirm("Discard unsaved changes?")) return;
    document.getElementById("profileSelector").value = "";
    appState.activeProfileName = null;
    appState.isDirty = false;
    updatePreviewCard();
    populateEditorTab();
  });
}

const saveBtn = document.getElementById("saveBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", function () {
    const newProfileName = document.getElementById("profileName").value.trim();
    if (!newProfileName)
      return alert("Please enter a name to save this profile as!");

    const finalData = getFormData();
    appState.profiles[newProfileName] = finalData;
    appState.activeProfileName = newProfileName;
    appState.isDirty = false;

    chrome.storage.local.set({ savedProfiles: appState.profiles }, () => {
      saveBtn.textContent = "✅ Saved!";
      setTimeout(() => populateEditorTab(), 2000);
      refreshProfileDropdown();
      document.getElementById("profileSelector").value = newProfileName;
      updatePreviewCard();
    });
  });
}

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", function () {
    const finalData = getFormData();
    const jsonString = JSON.stringify(finalData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename:
        (document.getElementById("profileName").value || "profile") + ".json",
      saveAs: true,
    });
  });
}

const importFile = document.getElementById("importFile");
if (importFile) {
  importFile.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        document.getElementById("profileName").value = file.name.replace(
          ".json",
          "",
        );

        appState.activeProfileName = null;
        appState.isDirty = true;
        document.getElementById("editorHeader").textContent =
          "📂 Imported Profile *(Unsaved)*";

        const form = document.getElementById("jsonForm");
        for (const key in data) {
          const field = form.querySelector(`[name="${key}"]`);
          if (field) {
            field.value = data[key];
            field.dispatchEvent(new Event("change"));
          }
        }
        setTimeout(() => {
          const dynamicFields = [
            "present_upazila",
            "gra_subject",
            "mas_subject",
            "ssc_group",
            "hsc_group",
            "ssc_board",
            "hsc_board",
          ];
          dynamicFields.forEach((f) => {
            const field = form.querySelector(`[name="${f}"]`);
            if (field && data[f]) field.value = data[f];
          });
        }, 150);
      } catch (error) {
        alert("Error reading JSON file.");
      }
    };
    reader.readAsText(file);
  });
}

// CAPTCHA Only Button Listener
document.getElementById("solveCaptchaOnlyBtn")?.addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: "AUTO_SOLVE_CAPTCHA" });
        window.close();
    }
});

// --- 7. AUTO-FILL + CAPTCHA SOLVER INJECTION ---
document.getElementById("injectBtn").addEventListener("click", async () => {
  const selectedProfile = document.getElementById("profileSelector").value;
  if (!selectedProfile) return alert("Please select a profile first!");

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.storage.local.get(["savedProfiles"], async (result) => {
    const profiles = result.savedProfiles || {};
    const dataToInject = profiles[selectedProfile];
    
    if (!dataToInject) return alert("Error: Profile data could not be found!");

    chrome.storage.local.set({ page2Armed: selectedProfile });

    const masterDict = {};

    document.querySelectorAll("select").forEach((select) => {
      masterDict[select.name] = {};
      for (let opt of select.options) {
        if (opt.value) masterDict[select.name][opt.value] = opt.text.trim();
      }
    });

    if (!masterDict["present_upazila"]) masterDict["present_upazila"] = {};
    for (const dist in districtData) {
      districtData[dist].forEach((upz) => {
        masterDict["present_upazila"][upz.id] = upz.name.trim();
      });
    }

    const subFields = ["ssc_group", "hsc_group", "gra_subject", "mas_subject"];
    subFields.forEach((field) => {
      if (!masterDict[field]) masterDict[field] = {};
      for (const exam in subjectData) {
        subjectData[exam].forEach((sub) => {
          masterDict[field][sub.id] = sub.name.trim();
        });
      }
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (profile, dict) => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        function fill(name, value) {
          if (value === undefined || value === "") return;

          const el =
            document.getElementsByName(name)[0] ||
            document.getElementById(name);
          if (!el) return;

          el.value = value;

          if (el.tagName === "SELECT") {
            const expectedText =
              dict[name] && dict[name][value]
                ? dict[name][value].toLowerCase().trim()
                : null;

            let isCorrect = false;
            if (el.selectedIndex >= 0) {
              const currentText = el.options[el.selectedIndex].text
                .toLowerCase()
                .trim();
              const currentVal = el.options[el.selectedIndex].value;

              if (expectedText && currentText === expectedText) {
                isCorrect = true;
              } else if (!expectedText && currentVal === String(value)) {
                isCorrect = true;
              }
            }

            if (!isCorrect) {
              const targetValStr = String(value).toLowerCase().trim();

              for (let i = 0; i < el.options.length; i++) {
                const optVal = el.options[i].value;
                const optText = el.options[i].text.toLowerCase().trim();

                if (expectedText && optText === expectedText) {
                  el.selectedIndex = i;
                  break;
                }

                if (!isNaN(optVal) && !isNaN(value) && optVal.trim() !== "" && String(value).trim() !== "") {
                  if (Number(optVal) === Number(value)) {
                    el.selectedIndex = i;
                    break;
                  }
                }

                if (optVal.toLowerCase().trim() === targetValStr || optText === targetValStr) {
                  el.selectedIndex = i;
                  break;
                }
              }
            }
          }

          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        function check(name) {
          const el =
            document.getElementsByName(name)[0] ||
            document.getElementById(name);
          if (el && !el.checked) {
            el.click();
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        console.log("🚀 Starting Auto-Fill...");

        fill("name", profile.name);
        fill("name_bn", profile.name_bn);
        fill("father", profile.father);
        fill("father_bn", profile.father_bn);
        fill("mother", profile.mother);
        fill("mother_bn", profile.mother_bn);
        fill("dob", profile.dob);
        fill("nationality", profile.nationality);
        fill("religion", profile.religion);
        fill("gender", profile.gender);

        const hasNid = profile.nid_no && String(profile.nid_no).trim() !== "";
        fill("nid", hasNid ? profile.nid : "No");
        if (hasNid) fill("nid_no", profile.nid_no);

        const hasBreg = profile.breg_no && String(profile.breg_no).trim() !== "";
        fill("breg", hasBreg ? profile.breg : "No");
        if (hasBreg) fill("breg_no", profile.breg_no);

        const hasPassport = profile.passport_no && String(profile.passport_no).trim() !== "";
        fill("passport", hasPassport ? profile.passport : "No");
        if (hasPassport) fill("passport_no", profile.passport_no);

        fill("marital_status", profile.marital_status);
        fill("mobile", profile.mobile);
        fill("confirm_mobile", profile.mobile);
        fill("email", profile.email);
        fill("quota", profile.quota);
        fill("dep_status", profile.dep_status);

        fill("present_careof", profile.present_careof);
        fill("present_village", profile.present_village);
        fill("present_post", profile.present_post);
        fill("present_postcode", profile.present_postcode);
        fill("present_district", profile.present_district);

        fill("ssc_roll", profile.ssc_roll);
        fill("ssc_result_type", profile.ssc_result_type);
        fill("ssc_result", profile.ssc_result);
        fill("ssc_year", profile.ssc_year);
        fill("ssc_exam", profile.ssc_exam);

        if (profile.hsc_exam) {
          check("if_applicable_hsc");
          fill("hsc_roll", profile.hsc_roll);
          fill("hsc_result_type", profile.hsc_result_type);
          fill("hsc_result", profile.hsc_result);
          fill("hsc_year", profile.hsc_year);
          fill("hsc_exam", profile.hsc_exam);
        }

        if (profile.gra_exam) {
          check("if_applicable_gra");
          fill("gra_result_type", profile.gra_result_type);
          fill("gra_result", profile.gra_result);
          fill("gra_duration", profile.gra_duration);
          fill("gra_year", profile.gra_year);
          fill("gra_exam", profile.gra_exam);
        }

        if (profile.mas_exam) {
          check("if_applicable_mas");
          fill("mas_result_type", profile.mas_result_type);
          fill("mas_result", profile.mas_result);
          fill("mas_duration", profile.mas_duration);
          fill("mas_year", profile.mas_year);
          fill("mas_exam", profile.mas_exam);
        }

        await sleep(1500); 

        fill("present_upazila", profile.present_upazila);
        fill("ssc_board", profile.ssc_board);
        fill("ssc_group", profile.ssc_group);

        if (profile.hsc_exam) {
          fill("hsc_board", profile.hsc_board);
          fill("hsc_group", profile.hsc_group);
        }
        if (profile.gra_exam) {
          fill("gra_institute", profile.gra_institute);
          fill("gra_subject", profile.gra_subject);
        }
        if (profile.mas_exam) {
          fill("mas_institute", profile.mas_institute);
          fill("mas_subject", profile.mas_subject);
        }

        await sleep(500);

        const allSelects = document.querySelectorAll("select");
        const protectedFields = ["nid", "breg", "passport", "gender", "religion", "quota", "dep_status", "marital_status"];

        allSelects.forEach((select) => {
          if (protectedFields.includes(select.name)) return;
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.trim().toLowerCase() === "yes") {
              select.selectedIndex = i;
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
        });

        check("same_as_present");
        check("agree");

        const captchaInput = document.getElementById('captcha');
        if (captchaInput) {
            captchaInput.style.border = "3px solid #ff9800";
            captchaInput.style.backgroundColor = "#fff3e0";
            captchaInput.style.boxShadow = "0 0 10px rgba(255, 152, 0, 0.8)";
            captchaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => { captchaInput.focus(); }, 300);
        }

        function injectVirtualFile(base64Data, filename, keywords) {
            if (!base64Data || base64Data.trim() === "") return;
            
            const fileInputs = document.querySelectorAll('input[type="file"]');
            let target = null;
            
            for (const el of fileInputs) {
                const identifier = ((el.name || "") + " " + (el.id || "") + " " + (el.className || "")).toLowerCase();
                if (keywords.some(kw => identifier.includes(kw))) {
                    target = el;
                    break;
                }
            }

            if (target) {
                try {
                    const arr = base64Data.split(',');
                    const mime = arr[0].match(/:(.*?);/)[1];
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
                    const file = new File([u8arr], filename, { type: mime });

                    const dt = new DataTransfer();
                    dt.items.add(file);
                    target.files = dt.files;
                    
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    target.style.border = "3px solid #4CAF50";
                } catch (err) {
                    console.error(`❌ Error uploading ${filename}:`, err);
                }
            }
        }

        injectVirtualFile(profile.photo_base64, "photo.jpg", ["photo", "pic", "image"]);
        injectVirtualFile(profile.signature_base64, "signature.jpg", ["sig", "sign"]);

        console.log("✅ Auto-Fill Complete!");
      },
      args: [dataToInject, masterDict],
    });

    // ⚡ AUTOMATICALLY TRIGGER CAPTCHA SOLVER ON ACTIVE TAB RIGHT AFTER AUTO-FILL
    chrome.tabs.sendMessage(tab.id, { type: "AUTO_SOLVE_CAPTCHA" });

    window.close();
  });
});