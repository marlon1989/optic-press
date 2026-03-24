import os
import time
from playwright.sync_api import sync_playwright, expect

def setup_assets():
    if not os.path.exists('tests'):
        os.makedirs('tests')
    
    with open('tests/dummy.png', 'wb') as f:
        # A 1x1 base64 transparent PNG
        f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0aIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')
    
    with open('tests/invalid.txt', 'w') as f:
        f.write('This is not an image.')
        
    with open('tests/huge.png', 'wb') as f:
        # Generate a 51MB sparse dummy file
        f.seek((51 * 1024 * 1024) - 1)
        f.write(b'\0')
        
    print("[SETUP] Dummy test assets created in ./tests folder.")

def run_tests():
    setup_assets()
    print("Starting OpticPress E2E Test Suite...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        
        # Test 1: Theme Switch
        import re
        print("\n[TEST 1/5] Theme Switch (Light/Dark)")
        theme_btn = page.locator('#theme-menu-button')
        theme_btn.click()
        page.locator('[data-theme="dark"]').click()
        expect(page.locator('html')).to_have_class(re.compile(r'dark'))
        time.sleep(0.5)
        
        theme_btn.click()
        page.locator('[data-theme="light"]').click()
        expect(page.locator('html')).not_to_have_class(re.compile(r'dark'))
        print(" -> Passed")

        # Set to Dark mode for the rest of the test flow
        theme_btn.click()
        page.locator('[data-theme="dark"]').click() 
        
        # Test 2: Edge Case -> Invalid Format
        print("\n[TEST 2/5] Invalid Format Upload (.txt)")
        page.locator('#file-input').set_input_files('tests/invalid.txt')
        toast = page.locator('#optic-toast')
        expect(toast).to_be_visible()
        expect(toast).to_contain_text("Oops! We don't support this format")
        time.sleep(3) # Wait for toast animation cleanup
        print(" -> Passed")
        
        # Test 3: Edge Case -> Oversized Payload (>50MB)
        print("\n[TEST 3/5] Oversized Payload Upload (>50MB)")
        page.locator('#file-input').set_input_files('tests/huge.png')
        toast = page.locator('#optic-toast')
        expect(toast).to_be_visible()
        expect(toast).to_contain_text("This file is a bit too large:")
        time.sleep(3) # Wait for toast cleanup
        print(" -> Passed")
        
        # Test 4: Edge Case -> Mixed Batch
        print("\n[TEST 4/5] Mixed Batch Upload (1 Valid, 1 Invalid, 1 Huge)")
        # Array of files to test the system rejecting 2 and processing 1
        page.locator('#file-input').set_input_files(['tests/invalid.txt', 'tests/huge.png', 'tests/dummy.png'])
        
        # Wait for compression to finish (active section should disappear, completed should appear)
        active_section = page.locator('#active-compression-section')
        expect(active_section).to_be_hidden(timeout=15000)
        
        completed_section = page.locator('#completed-compression-section')
        expect(completed_section).to_be_visible(timeout=10000)
        
        stats_text = page.locator('#completed-compression-stats').inner_text()
        print(f" -> Processed 1 valid file successfully. Stats output: {stats_text}")
        print(" -> Passed")
        
        # Test 5: Standard Happy Path Download
        print("\n[TEST 5/5] Happy Path: Download All ZIP Extraction")
        with page.expect_download() as download_info:
            page.locator('#download-all-btn').click()
        download = download_info.value
        assert download.suggested_filename.endswith('.zip'), "Downloaded file is not a ZIP"
        print(f" -> Download payload triggered correctly: {download.suggested_filename}")
        print(" -> Passed")
        
        browser.close()
        print("\n✅ All OpticPress 'Prosumer' Resilience Tests Passed Successfully!")

if __name__ == '__main__':
    run_tests()
